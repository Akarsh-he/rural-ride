import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, withTransaction } from '../../config/database';
import { config } from '../../config/env';
import { logger } from '../../utils/logger';
export class AppError extends Error {
  constructor(public message: string, public statusCode: number = 400) {
    super(message);
    this.name = 'AppError';
  }
}
export class ValidationError extends AppError {
  constructor(message: string) { super(message, 400); this.name = 'ValidationError'; }
}
export class NotFoundError extends AppError {
  constructor(resource: string) { super(`${resource} not found`, 404); this.name = 'NotFoundError'; }
}
export class UnauthorizedError extends AppError {
  constructor(message: string) { super(message, 401); this.name = 'UnauthorizedError'; }
}

export class AdminService {
  /** Authenticate administrator via database record and bcrypt */
  async login(email: string, password: string, ipAddress?: string): Promise<{ token: string; admin: any }> {
    const res = await query<any>(
      'SELECT id, email, password_hash, name, role, is_active FROM admin_accounts WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (res.rows.length === 0) {
      throw new UnauthorizedError('Invalid admin email or password');
    }

    const admin = res.rows[0];
    if (!admin.is_active) {
      throw new UnauthorizedError('Admin account has been deactivated. Contact Super Admin.');
    }

    const isValid = bcrypt.compareSync(password, admin.password_hash);
    if (!isValid) {
      throw new UnauthorizedError('Invalid admin email or password');
    }

    // Update last_login_at
    await query('UPDATE admin_accounts SET last_login_at = NOW() WHERE id = $1', [admin.id]);

    // Sign JWT token with 7 days expiry
    const token = jwt.sign(
      { adminId: admin.id, email: admin.email, role: admin.role },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    await this.logAudit({
      adminId: admin.id,
      adminEmail: admin.email,
      action: 'LOGIN',
      targetType: 'admin_accounts',
      targetId: admin.id,
      details: { ip: ipAddress },
      ipAddress,
    });

    return {
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
    };
  }

  async getMe(adminId: string): Promise<any> {
    const res = await query<any>(
      'SELECT id, email, name, role, created_at, last_login_at FROM admin_accounts WHERE id = $1',
      [adminId]
    );
    if (res.rows.length === 0) throw new NotFoundError('Admin account');
    return res.rows[0];
  }

  /** Write immutable audit entry */
  async logAudit(data: {
    adminId?: string;
    adminEmail: string;
    action: string;
    targetType: string;
    targetId?: string;
    details?: any;
    ipAddress?: string;
  }): Promise<void> {
    try {
      await query(
        `INSERT INTO admin_audit_logs (admin_id, admin_email, action, target_type, target_id, details, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          data.adminId ?? null,
          data.adminEmail,
          data.action,
          data.targetType,
          data.targetId ?? null,
          data.details ? JSON.stringify(data.details) : null,
          data.ipAddress ?? null,
        ]
      );
    } catch (err) {
      logger.error('Failed to write audit log', { error: (err as Error).message });
    }
  }

  /** Real-time KPI summary computed directly from the database */
  async getDashboardStats(): Promise<any> {
    const [
      driversRes,
      passengersRes,
      journeysTodayRes,
      revenueTodayRes,
      pendingVerifRes,
      openTicketsRes,
      totalJourneysRes,
      completedJourneysRes,
      cancelledJourneysRes,
      totalVehiclesRes,
      activeSubsRes,
    ] = await Promise.all([
      query<{ count: string }>('SELECT COUNT(*) as count FROM driver_profiles'),
      query<{ count: string }>('SELECT COUNT(*) as count FROM passenger_profiles'),
      query<{ count: string }>("SELECT COUNT(*) as count FROM journeys WHERE created_at >= CURRENT_DATE"),
      query<{ sum: string | null }>("SELECT SUM(amount) as sum FROM payments WHERE status = 'paid' AND created_at >= CURRENT_DATE"),
      query<{ count: string }>("SELECT COUNT(*) as count FROM driver_profiles WHERE verification_status = 'pending'"),
      query<{ count: string }>("SELECT COUNT(*) as count FROM support_tickets WHERE status = 'open'"),
      query<{ count: string }>('SELECT COUNT(*) as count FROM journeys'),
      query<{ count: string }>("SELECT COUNT(*) as count FROM journeys WHERE status = 'completed'"),
      query<{ count: string }>("SELECT COUNT(*) as count FROM journeys WHERE status = 'cancelled'"),
      query<{ count: string }>('SELECT COUNT(*) as count FROM vehicles'),
      query<{ count: string }>("SELECT COUNT(*) as count FROM driver_subscriptions WHERE status = 'active'"),
    ]);

    return {
      totalDrivers: parseInt(driversRes.rows[0]?.count || '0', 10),
      totalPassengers: parseInt(passengersRes.rows[0]?.count || '0', 10),
      journeysToday: parseInt(journeysTodayRes.rows[0]?.count || '0', 10),
      revenueToday: parseFloat(revenueTodayRes.rows[0]?.sum || '0'),
      pendingVerifications: parseInt(pendingVerifRes.rows[0]?.count || '0', 10),
      openTickets: parseInt(openTicketsRes.rows[0]?.count || '0', 10),
      totalJourneys: parseInt(totalJourneysRes.rows[0]?.count || '0', 10),
      completedJourneys: parseInt(completedJourneysRes.rows[0]?.count || '0', 10),
      cancelledJourneys: parseInt(cancelledJourneysRes.rows[0]?.count || '0', 10),
      totalVehicles: parseInt(totalVehiclesRes.rows[0]?.count || '0', 10),
      activeSubscriptions: parseInt(activeSubsRes.rows[0]?.count || '0', 10),
    };
  }

  /** Real revenue series grouped by date from database payments */
  async getRevenueTrend(days = 30): Promise<any[]> {
    const res = await query<any>(
      `SELECT DATE(created_at) as date,
              COALESCE(SUM(amount), 0)::numeric as revenue,
              COUNT(*)::int as rides,
              COALESCE(SUM(platform_commission), 0)::numeric as commission
       FROM payments
       WHERE status = 'paid' AND created_at >= CURRENT_DATE - ($1 || ' days')::interval
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [days]
    );

    return res.rows.map((r) => ({
      date: new Date(r.date).toISOString().split('T')[0],
      revenue: parseFloat(r.revenue),
      rides: parseInt(r.rides, 10),
      commission: parseFloat(r.commission),
    }));
  }

  /** Real bookings count by date */
  async getBookingsChart(days = 7): Promise<any[]> {
    const res = await query<any>(
      `SELECT DATE(created_at) as date,
              COUNT(*)::int as count,
              COUNT(*) FILTER (WHERE status = 'completed')::int as completed,
              COUNT(*) FILTER (WHERE status = 'cancelled')::int as cancelled
       FROM confirmed_bookings
       WHERE created_at >= CURRENT_DATE - ($1 || ' days')::interval
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [days]
    );

    return res.rows.map((r) => ({
      date: new Date(r.date).toISOString().split('T')[0],
      count: parseInt(r.count, 10),
      completed: parseInt(r.completed, 10),
      cancelled: parseInt(r.cancelled, 10),
    }));
  }

  /** Actual vehicle distribution by registered types */
  async getVehicleDistribution(): Promise<any[]> {
    const res = await query<any>(
      `SELECT vehicle_type as type, COUNT(*)::int as count
       FROM vehicles
       GROUP BY vehicle_type`
    );

    const total = res.rows.reduce((sum, r) => sum + parseInt(r.count, 10), 0);
    return res.rows.map((r) => ({
      type: r.type,
      count: parseInt(r.count, 10),
      percentage: total > 0 ? Math.round((parseInt(r.count, 10) / total) * 100) : 0,
    }));
  }

  /** Live monitoring: Only drivers with active journeys, online consent, and location stream */
  async getLiveDrivers(): Promise<any[]> {
    const res = await query<any>(
      `SELECT dp.id,
              u.name,
              u.phone,
              dp.is_online,
              ST_Y(dp.current_location::geometry) as lat,
              ST_X(dp.current_location::geometry) as lng,
              dp.location_updated_at,
              v.vehicle_type,
              v.registration_number,
              j.id as active_journey_id,
              j.available_seats,
              j.origin_name as pickup_name,
              j.destination_name
       FROM driver_profiles dp
       JOIN users u ON u.id = dp.user_id
       LEFT JOIN vehicles v ON v.driver_id = dp.id
       JOIN journeys j ON j.driver_id = dp.id AND j.status = 'active'
       WHERE dp.is_online = true
         AND dp.current_location IS NOT NULL
         AND dp.location_updated_at >= NOW() - INTERVAL '10 minutes'`
    );

    return res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      isOnline: r.is_online,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lng),
      vehicleType: r.vehicle_type || 'auto',
      registrationNumber: r.registration_number,
      activeJourneyId: r.active_journey_id,
      availableSeats: r.available_seats,
      pickupName: r.pickup_name,
      destinationName: r.destination_name,
      updatedAt: r.location_updated_at,
    }));
  }

  /** Recent bookings for dashboard preview */
  async getRecentBookings(limit = 10): Promise<any[]> {
    const res = await query<any>(
      `SELECT cb.id,
              cb.pickup_name,
              cb.dropoff_name,
              cb.confirmed_fare,
              cb.status,
              cb.payment_method,
              cb.payment_status,
              cb.created_at,
              pu.name as passenger_name,
              du.name as driver_name,
              v.vehicle_type
       FROM confirmed_bookings cb
       LEFT JOIN passenger_profiles pp ON pp.id = cb.passenger_id
       LEFT JOIN users pu ON pu.id = pp.user_id
       LEFT JOIN driver_profiles dp ON dp.id = cb.driver_id
       LEFT JOIN users du ON du.id = dp.user_id
       LEFT JOIN vehicles v ON v.driver_id = dp.id
       ORDER BY cb.created_at DESC
       LIMIT $1`,
      [limit]
    );

    return res.rows.map((r) => ({
      id: r.id,
      passengerName: r.passenger_name || 'यात्री (Passenger)',
      driverName: r.driver_name || 'सारथी (Driver)',
      pickupName: r.pickup_name,
      dropoffName: r.dropoff_name,
      fare: parseFloat(r.confirmed_fare || '0'),
      status: r.status,
      paymentMethod: r.payment_method,
      paymentStatus: r.payment_status,
      vehicleType: r.vehicle_type || 'auto',
      createdAt: r.created_at,
    }));
  }

  // ── Drivers Management ─────────────────────────────────────────

  async listDrivers(page = 1, limit = 20, status?: string, search?: string): Promise<{ data: any[]; total: number }> {
    const offset = (page - 1) * limit;
    const params: any[] = [];
    let whereConditions: string[] = [];

    if (status) {
      params.push(status);
      whereConditions.push(`dp.verification_status = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      whereConditions.push(`(u.name ILIKE $${params.length} OR u.phone ILIKE $${params.length} OR v.registration_number ILIKE $${params.length})`);
    }

    const whereClause = whereConditions.length ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const countRes = await query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM driver_profiles dp
       JOIN users u ON u.id = dp.user_id
       LEFT JOIN vehicles v ON v.driver_id = dp.id
       ${whereClause}`,
      params
    );
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    params.push(limit, offset);
    const rowsRes = await query<any>(
      `SELECT dp.id,
              dp.user_id,
              u.name,
              u.phone,
              u.status as user_status,
              dp.verification_status,
              dp.is_online,
              dp.rating,
              dp.total_ratings as total_rides,
              dp.subscription_plan,
              dp.created_at,
              dp.updated_at,
              v.id as vehicle_id,
              v.vehicle_type,
              v.registration_number,
              v.make,
              v.model,
              v.capacity,
              v.color
       FROM driver_profiles dp
       JOIN users u ON u.id = dp.user_id
       LEFT JOIN vehicles v ON v.driver_id = dp.id
       ${whereClause}
       ORDER BY dp.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return {
      total,
      data: rowsRes.rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        name: r.name,
        phone: r.phone,
        status: r.user_status,
        verificationStatus: r.verification_status,
        rating: parseFloat(r.rating || '0'),
        totalRides: parseInt(r.total_rides || '0', 10),
        isOnline: r.is_online,
        subscriptionPlan: r.subscription_plan || 'basic',
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        vehicle: r.vehicle_id
          ? {
              id: r.vehicle_id,
              type: r.vehicle_type,
              registrationNumber: r.registration_number,
              make: r.make,
              model: r.model,
              capacity: r.capacity,
              color: r.color,
            }
          : undefined,
      })),
    };
  }

  async getDriver(id: string): Promise<any> {
    const res = await query<any>(
      `SELECT dp.*, u.name, u.phone, u.status as user_status,
              v.id as vehicle_id, v.vehicle_type, v.registration_number, v.make, v.model, v.capacity, v.color
       FROM driver_profiles dp
       JOIN users u ON u.id = dp.user_id
       LEFT JOIN vehicles v ON v.driver_id = dp.id
       WHERE dp.id = $1`,
      [id]
    );

    if (res.rows.length === 0) throw new NotFoundError('Driver');
    const d = res.rows[0];

    const docsRes = await query<any>(
      'SELECT id, document_type, document_url, verification_status, rejection_reason, verified_at, created_at FROM driver_documents WHERE driver_id = $1',
      [id]
    );

    return {
      ...d,
      documents: docsRes.rows,
    };
  }

  async suspendDriver(id: string, reason: string, adminId: string, adminEmail: string): Promise<void> {
    await withTransaction(async (client) => {
      const driverRes = await client.query<{ user_id: string }>(
        'SELECT user_id FROM driver_profiles WHERE id = $1',
        [id]
      );
      if (driverRes.rows.length === 0) throw new NotFoundError('Driver');

      await client.query(
        "UPDATE users SET status = 'suspended', suspension_reason = $1, updated_at = NOW() WHERE id = $2",
        [reason, driverRes.rows[0].user_id]
      );
      await client.query(
        'UPDATE driver_profiles SET is_online = false, updated_at = NOW() WHERE id = $1',
        [id]
      );
    });

    await this.logAudit({
      adminId,
      adminEmail,
      action: 'SUSPEND_DRIVER',
      targetType: 'driver_profiles',
      targetId: id,
      details: { reason },
    });
  }

  async activateDriver(id: string, adminId: string, adminEmail: string): Promise<void> {
    await withTransaction(async (client) => {
      const driverRes = await client.query<{ user_id: string }>(
        'SELECT user_id FROM driver_profiles WHERE id = $1',
        [id]
      );
      if (driverRes.rows.length === 0) throw new NotFoundError('Driver');

      await client.query(
        "UPDATE users SET status = 'active', suspension_reason = NULL, updated_at = NOW() WHERE id = $1",
        [driverRes.rows[0].user_id]
      );
    });

    await this.logAudit({
      adminId,
      adminEmail,
      action: 'ACTIVATE_DRIVER',
      targetType: 'driver_profiles',
      targetId: id,
    });
  }

  async verifyDriverDocument(
    driverId: string,
    docId: string,
    action: 'approve' | 'reject',
    reason?: string,
    adminId?: string,
    adminEmail?: string
  ): Promise<void> {
    const status = action === 'approve' ? 'verified' : 'rejected';
    await query(
      `UPDATE driver_documents
       SET verification_status = $1,
           rejection_reason = $2,
           verified_at = NOW(),
           verified_by = $3
       WHERE id = $4 AND driver_id = $5`,
      [status, reason ?? null, adminId ?? null, docId, driverId]
    );

    // If all required documents are verified, promote driver to verified
    if (action === 'approve') {
      const pendingDocs = await query<{ count: string }>(
        "SELECT COUNT(*) as count FROM driver_documents WHERE driver_id = $1 AND verification_status != 'verified'",
        [driverId]
      );
      if (parseInt(pendingDocs.rows[0]?.count || '0', 10) === 0) {
        await query(
          "UPDATE driver_profiles SET verification_status = 'verified', updated_at = NOW() WHERE id = $1",
          [driverId]
        );
      }
    } else {
      await query(
        "UPDATE driver_profiles SET verification_status = 'rejected', updated_at = NOW() WHERE id = $1",
        [driverId]
      );
    }

    if (adminEmail) {
      await this.logAudit({
        adminId,
        adminEmail,
        action: `DOC_${action.toUpperCase()}`,
        targetType: 'driver_documents',
        targetId: docId,
        details: { driverId, action, reason },
      });
    }
  }

  // ── Passengers Management ──────────────────────────────────────

  async listPassengers(page = 1, limit = 20, status?: string, search?: string): Promise<{ data: any[]; total: number }> {
    const offset = (page - 1) * limit;
    const params: any[] = [];
    let whereConditions: string[] = [];

    if (status) {
      params.push(status);
      whereConditions.push(`u.status = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      whereConditions.push(`(u.name ILIKE $${params.length} OR u.phone ILIKE $${params.length})`);
    }

    const whereClause = whereConditions.length ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const countRes = await query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM passenger_profiles pp
       JOIN users u ON u.id = pp.user_id
       ${whereClause}`,
      params
    );
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    params.push(limit, offset);
    const rowsRes = await query<any>(
      `SELECT pp.id,
              pp.user_id,
              u.name,
              u.phone,
              u.status as user_status,
              pp.total_rides,
              pp.emergency_contacts,
              pp.created_at,
              pp.updated_at
       FROM passenger_profiles pp
       JOIN users u ON u.id = pp.user_id
       ${whereClause}
       ORDER BY pp.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return {
      total,
      data: rowsRes.rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        name: r.name,
        phone: r.phone,
        status: r.user_status,
        totalRides: r.total_rides,
        emergencyContacts: r.emergency_contacts || [],
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    };
  }

  async suspendPassenger(id: string, reason: string, adminId: string, adminEmail: string): Promise<void> {
    const pRes = await query<{ user_id: string }>(
      'SELECT user_id FROM passenger_profiles WHERE id = $1',
      [id]
    );
    if (pRes.rows.length === 0) throw new NotFoundError('Passenger');

    await query(
      "UPDATE users SET status = 'suspended', suspension_reason = $1, updated_at = NOW() WHERE id = $2",
      [reason, pRes.rows[0].user_id]
    );

    await this.logAudit({
      adminId,
      adminEmail,
      action: 'SUSPEND_PASSENGER',
      targetType: 'passenger_profiles',
      targetId: id,
      details: { reason },
    });
  }

  async activatePassenger(id: string, adminId: string, adminEmail: string): Promise<void> {
    const pRes = await query<{ user_id: string }>(
      'SELECT user_id FROM passenger_profiles WHERE id = $1',
      [id]
    );
    if (pRes.rows.length === 0) throw new NotFoundError('Passenger');

    await query(
      "UPDATE users SET status = 'active', suspension_reason = NULL, updated_at = NOW() WHERE id = $1",
      [pRes.rows[0].user_id]
    );

    await this.logAudit({
      adminId,
      adminEmail,
      action: 'ACTIVATE_PASSENGER',
      targetType: 'passenger_profiles',
      targetId: id,
    });
  }

  // ── Journeys Management ────────────────────────────────────────

  async listJourneys(page = 1, limit = 20, status?: string): Promise<{ data: any[]; total: number }> {
    const offset = (page - 1) * limit;
    const params: any[] = [];
    let whereClause = '';

    if (status) {
      params.push(status);
      whereClause = 'WHERE j.status = $1';
    }

    const countRes = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM journeys j ${whereClause}`,
      params
    );
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    params.push(limit, offset);
    const rowsRes = await query<any>(
      `SELECT j.*,
              u.name as driver_name,
              u.phone as driver_phone,
              v.vehicle_type,
              v.registration_number
       FROM journeys j
       JOIN driver_profiles dp ON dp.id = j.driver_id
       JOIN users u ON u.id = dp.user_id
       LEFT JOIN vehicles v ON v.driver_id = dp.id
       ${whereClause}
       ORDER BY j.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return { total, data: rowsRes.rows };
  }

  async cancelJourney(id: string, reason: string, adminId: string, adminEmail: string): Promise<void> {
    await query(
      "UPDATE journeys SET status = 'cancelled', updated_at = NOW() WHERE id = $1",
      [id]
    );

    await this.logAudit({
      adminId,
      adminEmail,
      action: 'CANCEL_JOURNEY',
      targetType: 'journeys',
      targetId: id,
      details: { reason },
    });
  }

  // ── Bookings Management ────────────────────────────────────────

  async listBookings(page = 1, limit = 20, status?: string): Promise<{ data: any[]; total: number }> {
    const offset = (page - 1) * limit;
    const params: any[] = [];
    let whereClause = '';

    if (status) {
      params.push(status);
      whereClause = 'WHERE cb.status = $1';
    }

    const countRes = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM confirmed_bookings cb ${whereClause}`,
      params
    );
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    params.push(limit, offset);
    const rowsRes = await query<any>(
      `SELECT cb.*,
              pu.name as passenger_name,
              pu.phone as passenger_phone,
              du.name as driver_name,
              du.phone as driver_phone,
              v.vehicle_type,
              v.registration_number
       FROM confirmed_bookings cb
       JOIN passenger_profiles pp ON pp.id = cb.passenger_id
       JOIN users pu ON pu.id = pp.user_id
       JOIN driver_profiles dp ON dp.id = cb.driver_id
       JOIN users du ON du.id = dp.user_id
       LEFT JOIN vehicles v ON v.driver_id = dp.id
       ${whereClause}
       ORDER BY cb.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return { total, data: rowsRes.rows };
  }

  // ── Payments Management ────────────────────────────────────────

  async listPayments(page = 1, limit = 20, status?: string, method?: string, search?: string): Promise<{ data: any[]; total: number }> {
    const offset = (page - 1) * limit;
    const params: any[] = [];
    let where: string[] = [];

    if (status) {
      params.push(status);
      where.push(`p.status = $${params.length}`);
    }
    if (method) {
      params.push(method);
      where.push(`p.payment_method = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(p.id::text ILIKE $${params.length} OR p.razorpay_payment_id ILIKE $${params.length} OR p.booking_id::text ILIKE $${params.length})`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countRes = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM payments p ${whereClause}`,
      params
    );
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    params.push(limit, offset);
    const rowsRes = await query<any>(
      `SELECT p.id,
              p.booking_id as "bookingId",
              p.amount,
              p.platform_commission as "platformCommission",
              p.driver_earning as "driverEarning",
              p.payment_method as method,
              p.status,
              p.razorpay_payment_id as "razorpayPaymentId",
              p.processed_at as "paidAt",
              p.created_at as "createdAt"
       FROM payments p
       ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return { total, data: rowsRes.rows };
  }

  async getPaymentsSummary(): Promise<any> {
    const res = await query<any>(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) as "totalRevenue",
         COALESCE(SUM(platform_commission) FILTER (WHERE status = 'paid'), 0) as "totalCommission",
         COALESCE(SUM(driver_earning) FILTER (WHERE status = 'paid'), 0) as "totalDriverEarnings",
         COUNT(*) FILTER (WHERE status = 'paid') as "successfulTransactions",
         COUNT(*) FILTER (WHERE status = 'failed') as "failedTransactions",
         COUNT(*) FILTER (WHERE status = 'refunded') as "refundedTransactions"
       FROM payments`
    );

    return res.rows[0];
  }

  // ── Subscriptions Management ───────────────────────────────────

  async listSubscriptions(page = 1, limit = 20): Promise<{ data: any[]; total: number }> {
    const offset = (page - 1) * limit;
    const countRes = await query<{ count: string }>('SELECT COUNT(*) as count FROM driver_subscriptions');
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    const rowsRes = await query<any>(
      `SELECT ds.*, u.name as driver_name, u.phone as driver_phone
       FROM driver_subscriptions ds
       JOIN driver_profiles dp ON dp.id = ds.driver_id
       JOIN users u ON u.id = dp.user_id
       ORDER BY ds.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return { total, data: rowsRes.rows };
  }

  // ── Support Tickets ────────────────────────────────────────────

  async listSupportTickets(status?: string, category?: string): Promise<any[]> {
    const params: any[] = [];
    const where: string[] = [];

    if (status) {
      params.push(status);
      where.push(`st.status = $${params.length}`);
    }
    if (category) {
      params.push(category);
      where.push(`st.category = $${params.length}`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const res = await query<any>(
      `SELECT st.*, u.name as user_name, u.phone as user_phone
       FROM support_tickets st
       JOIN users u ON u.id = st.user_id
       ${whereClause}
       ORDER BY st.created_at DESC`,
      params
    );

    // Fetch messages for each ticket
    const ticketIds = res.rows.map((r) => r.id);
    let messagesMap: Record<string, any[]> = {};

    if (ticketIds.length) {
      const msgRes = await query<any>(
        `SELECT * FROM ticket_messages WHERE ticket_id = ANY($1::uuid[]) ORDER BY created_at ASC`,
        [ticketIds]
      );
      for (const m of msgRes.rows) {
        if (!messagesMap[m.ticket_id]) messagesMap[m.ticket_id] = [];
        messagesMap[m.ticket_id].push(m);
      }
    }

    return res.rows.map((r) => ({
      ...r,
      messages: messagesMap[r.id] || [],
    }));
  }

  async replySupportTicket(ticketId: string, message: string, adminId: string, adminEmail: string): Promise<void> {
    await query(
      `INSERT INTO ticket_messages (ticket_id, sender_id, sender_type, message)
       VALUES ($1, $2, 'admin', $3)`,
      [ticketId, adminId, message]
    );

    await query("UPDATE support_tickets SET status = 'in_progress', updated_at = NOW() WHERE id = $1", [ticketId]);

    await this.logAudit({
      adminId,
      adminEmail,
      action: 'REPLY_TICKET',
      targetType: 'support_tickets',
      targetId: ticketId,
      details: { message },
    });
  }

  async closeSupportTicket(ticketId: string, adminId: string, adminEmail: string): Promise<void> {
    await query("UPDATE support_tickets SET status = 'resolved', updated_at = NOW() WHERE id = $1", [ticketId]);

    await this.logAudit({
      adminId,
      adminEmail,
      action: 'CLOSE_TICKET',
      targetType: 'support_tickets',
      targetId: ticketId,
    });
  }

  // ── Advertisements ─────────────────────────────────────────────

  async listAdvertisements(): Promise<any[]> {
    const res = await query<any>('SELECT * FROM advertisements ORDER BY created_at DESC');
    return res.rows;
  }

  async createAdvertisement(data: any, adminId: string, adminEmail: string): Promise<any> {
    const res = await query<any>(
      `INSERT INTO advertisements (advertiser_name, business_category, ad_type, title, description, image_url, target_url, budget, cost_per_impression, status, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        data.advertiser_name,
        data.business_category ?? null,
        data.ad_type || 'banner',
        data.title,
        data.description ?? null,
        data.image_url ?? null,
        data.target_url ?? null,
        data.budget || 0,
        data.cost_per_impression || 0,
        data.status || 'draft',
        data.starts_at ?? null,
        data.ends_at ?? null,
      ]
    );

    await this.logAudit({
      adminId,
      adminEmail,
      action: 'CREATE_AD',
      targetType: 'advertisements',
      targetId: res.rows[0].id,
      details: data,
    });

    return res.rows[0];
  }

  async updateAdvertisement(id: string, data: any, adminId: string, adminEmail: string): Promise<any> {
    const res = await query<any>(
      `UPDATE advertisements
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           budget = COALESCE($3, budget),
           status = COALESCE($4, status),
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [data.title, data.description, data.budget, data.status, id]
    );

    if (res.rows.length === 0) throw new NotFoundError('Advertisement');

    await this.logAudit({
      adminId,
      adminEmail,
      action: 'UPDATE_AD',
      targetType: 'advertisements',
      targetId: id,
      details: data,
    });

    return res.rows[0];
  }

  async toggleAdvertisement(id: string, adminId: string, adminEmail: string): Promise<any> {
    const res = await query<any>(
      `UPDATE advertisements
       SET status = CASE WHEN status = 'active' THEN 'paused'::ad_status ELSE 'active'::ad_status END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (res.rows.length === 0) throw new NotFoundError('Advertisement');

    await this.logAudit({
      adminId,
      adminEmail,
      action: 'TOGGLE_AD',
      targetType: 'advertisements',
      targetId: id,
      details: { status: res.rows[0].status },
    });

    return res.rows[0];
  }

  async deleteAdvertisement(id: string, adminId: string, adminEmail: string): Promise<void> {
    await query('DELETE FROM advertisements WHERE id = $1', [id]);

    await this.logAudit({
      adminId,
      adminEmail,
      action: 'DELETE_AD',
      targetType: 'advertisements',
      targetId: id,
    });
  }

  // ── Platform Settings ──────────────────────────────────────────

  async getPlatformConfig(): Promise<any> {
    const res = await query<{ value: any }>(
      "SELECT value FROM platform_settings WHERE key = 'general_config'"
    );

    if (res.rows.length === 0) {
      return {
        platformCommissionPercent: 10,
        bookingTimeoutMinutes: 2,
        maxDeviationMeters: 500,
        sosAlertRadius: 2000,
        minDriverRating: 3.0,
        maxPassengersPerJourney: 6,
        supportPhone: '+91-542-2501234',
        supportEmail: 'support@ruralmobility.in',
        fareRates: {
          auto_rickshaw: 12,
          e_rickshaw: 8,
          tempo: 10,
          bus: 5,
          shared_cab: 15,
        },
      };
    }

    return res.rows[0].value;
  }

  async updatePlatformConfig(configObj: any, adminId: string, adminEmail: string): Promise<void> {
    await query(
      `INSERT INTO platform_settings (key, value, description, updated_by, updated_at)
       VALUES ('general_config', $1, 'Master system settings', $2, NOW())
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()`,
      [JSON.stringify(configObj), adminId]
    );

    await this.logAudit({
      adminId,
      adminEmail,
      action: 'UPDATE_CONFIG',
      targetType: 'platform_settings',
      targetId: 'general_config',
      details: configObj,
    });
  }
}
