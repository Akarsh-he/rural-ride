import { query, withTransaction } from '../../config/database';
import { NotFoundError, AppError } from '../../middleware/errorHandler';
import { DriverProfileRow, VehicleRow, DriverDashboard, JourneyRow } from '../../types';
import { setDriverLocation, DriverLocation } from '../../config/redis';
import { emitToJourney } from '../../realtime/socket';

export class DriversService {
  async getProfile(driverProfileId: string): Promise<DriverProfileRow> {
    const result = await query<DriverProfileRow>(
      `SELECT dp.*, u.phone, u.email, u.preferred_language
       FROM driver_profiles dp
       JOIN users u ON u.id = dp.user_id
       WHERE dp.id = $1`,
      [driverProfileId]
    );
    if (result.rows.length === 0) throw new NotFoundError('Driver profile');
    return result.rows[0];
  }

  async updateProfile(
    driverProfileId: string,
    data: Partial<Pick<DriverProfileRow, 'full_name' | 'profile_photo_url' | 'date_of_birth' | 'address'>>
  ): Promise<DriverProfileRow> {
    const result = await query<DriverProfileRow>(
      `UPDATE driver_profiles
       SET full_name = COALESCE($1, full_name),
           profile_photo_url = COALESCE($2, profile_photo_url),
           date_of_birth = COALESCE($3, date_of_birth),
           address = COALESCE($4, address),
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [
        data.full_name ?? null,
        data.profile_photo_url ?? null,
        data.date_of_birth ?? null,
        data.address ?? null,
        driverProfileId,
      ]
    );
    if (result.rows.length === 0) throw new NotFoundError('Driver profile');
    return result.rows[0];
  }

  async addVehicle(
    driverProfileId: string,
    data: Partial<VehicleRow>
  ): Promise<VehicleRow> {
    const result = await query<VehicleRow>(
      `INSERT INTO vehicles (
        driver_id, vehicle_type, registration_number, make, model,
        year, color, max_passengers, fuel_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        driverProfileId,
        data.vehicle_type,
        data.registration_number,
        data.make ?? null,
        data.model ?? null,
        data.year ?? null,
        data.color ?? null,
        data.max_passengers ?? 1,
        data.fuel_type ?? null,
      ]
    );
    // Set as active vehicle
    await query(
      `UPDATE driver_profiles SET vehicle_id = $1 WHERE id = $2`,
      [result.rows[0].id, driverProfileId]
    );
    return result.rows[0];
  }

  async updateVehicle(
    vehicleId: string,
    driverProfileId: string,
    data: Partial<VehicleRow>
  ): Promise<VehicleRow> {
    const result = await query<VehicleRow>(
      `UPDATE vehicles
       SET vehicle_type    = COALESCE($1, vehicle_type),
           registration_number = COALESCE($2, registration_number),
           make            = COALESCE($3, make),
           model           = COALESCE($4, model),
           year            = COALESCE($5, year),
           color           = COALESCE($6, color),
           max_passengers  = COALESCE($7, max_passengers),
           fuel_type       = COALESCE($8, fuel_type),
           updated_at      = NOW()
       WHERE id = $9 AND driver_id = $10
       RETURNING *`,
      [
        data.vehicle_type ?? null,
        data.registration_number ?? null,
        data.make ?? null,
        data.model ?? null,
        data.year ?? null,
        data.color ?? null,
        data.max_passengers ?? null,
        data.fuel_type ?? null,
        vehicleId,
        driverProfileId,
      ]
    );
    if (result.rows.length === 0) throw new NotFoundError('Vehicle');
    return result.rows[0];
  }

  async uploadDocument(
    driverProfileId: string,
    docType: string,
    fileUrl: string
  ): Promise<{ id: string }> {
    const result = await query<{ id: string }>(
      `INSERT INTO verification_documents (driver_id, doc_type, file_url, status)
       VALUES ($1, $2, $3, 'pending')
       ON CONFLICT (driver_id, doc_type)
       DO UPDATE SET file_url = $3, status = 'pending', updated_at = NOW()
       RETURNING id`,
      [driverProfileId, docType, fileUrl]
    );
    return result.rows[0];
  }

  async getDocuments(driverProfileId: string): Promise<unknown[]> {
    const result = await query(
      `SELECT id, doc_type, file_url, status, notes, created_at, updated_at
       FROM verification_documents WHERE driver_id = $1 ORDER BY doc_type`,
      [driverProfileId]
    );
    return result.rows;
  }

  async getDashboard(driverProfileId: string): Promise<DriverDashboard> {
    const [profileResult, earningsResult, pendingResult, activeResult] = await Promise.all([
      query<DriverProfileRow>(
        `SELECT dp.*, u.phone FROM driver_profiles dp JOIN users u ON u.id = dp.user_id WHERE dp.id = $1`,
        [driverProfileId]
      ),
      query<{ today: string; this_week: string; this_month: string }>(
        `SELECT
           COALESCE(SUM(CASE WHEN DATE(e.earned_at) = CURRENT_DATE THEN e.net_amount ELSE 0 END), 0) AS today,
           COALESCE(SUM(CASE WHEN e.earned_at >= date_trunc('week', NOW()) THEN e.net_amount ELSE 0 END), 0) AS this_week,
           COALESCE(SUM(CASE WHEN e.earned_at >= date_trunc('month', NOW()) THEN e.net_amount ELSE 0 END), 0) AS this_month
         FROM driver_earnings e WHERE e.driver_id = $1`,
        [driverProfileId]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM booking_requests WHERE driver_id = $1 AND status = 'pending' AND expires_at > NOW()`,
        [driverProfileId]
      ),
      query<JourneyRow>(
        `SELECT * FROM journeys WHERE driver_id = $1 AND status = 'active' LIMIT 1`,
        [driverProfileId]
      ),
    ]);

    if (profileResult.rows.length === 0) throw new NotFoundError('Driver');

    const dp = profileResult.rows[0];
    const earn = earningsResult.rows[0];

    return {
      driverId: driverProfileId,
      driverName: dp.full_name,
      isOnline: dp.is_online,
      rating: parseFloat(dp.rating),
      totalRides: dp.total_ratings,
      earnings: {
        today: parseFloat(earn.today),
        thisWeek: parseFloat(earn.this_week),
        thisMonth: parseFloat(earn.this_month),
      },
      activeJourney: activeResult.rows[0] ?? null,
      pendingBookings: parseInt(pendingResult.rows[0].count, 10),
      subscriptionPlan: dp.subscription_plan,
    };
  }

  async setOnlineStatus(driverProfileId: string, isOnline: boolean): Promise<void> {
    await query(
      `UPDATE driver_profiles SET is_online = $1, updated_at = NOW() WHERE id = $2`,
      [isOnline, driverProfileId]
    );
  }

  async updateLocation(
    driverProfileId: string,
    location: { lat: number; lng: number; heading?: number; speed?: number; journeyId?: string }
  ): Promise<void> {
    const loc: DriverLocation = {
      ...location,
      timestamp: new Date().toISOString(),
    };
    await setDriverLocation(driverProfileId, loc);

    await query(
      `UPDATE driver_profiles
       SET current_location = ST_SetSRID(ST_MakePoint($1, $2), 4326),
           location_updated_at = NOW()
       WHERE id = $3`,
      [location.lng, location.lat, driverProfileId]
    );
    if (location.journeyId) {
      const recordedAt = new Date();
      await query(
        `INSERT INTO journey_location_updates (journey_id, location, speed_kmh, heading, recorded_at)
         VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326), $4, $5, $6)`,
        [location.journeyId, location.lng, location.lat, location.speed ?? null,
          location.heading ?? null, recordedAt]
      );
      emitToJourney(location.journeyId, 'driver:location', {
        lat: location.lat, lng: location.lng, heading: location.heading,
        speed: location.speed, timestamp: recordedAt.toISOString(),
      });
    }
  }
}
