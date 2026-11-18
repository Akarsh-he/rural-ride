import { query, withTransaction } from '../../config/database';
import { NotFoundError, AppError, ValidationError } from '../../middleware/errorHandler';
import { config } from '../../config/env';
import {
  BookingRequestRow,
  ConfirmedBookingRow,
  BookingStatus,
  PaymentMethod,
} from '../../types';
import { estimateFareFromFraction } from '../../utils/fare-calculator';
import { emitToDriver, emitToPassenger } from '../../realtime/socket';

export class BookingsService {
  /** Release seats held by timed-out requests; safe to run from request paths. */
  async expireStaleRequests(filter: { journeyId?: string; driverProfileId?: string } = {}): Promise<void> {
    await withTransaction(async (client) => {
      const expired = await client.query<{ id: string; journey_id: string; seats_requested: number }>(
        `SELECT id, journey_id, seats_requested FROM booking_requests
         WHERE status = 'pending' AND expires_at <= NOW()
           AND ($1::uuid IS NULL OR journey_id = $1)
           AND ($2::uuid IS NULL OR driver_id = $2)
         FOR UPDATE SKIP LOCKED`,
        [filter.journeyId ?? null, filter.driverProfileId ?? null]
      );
      if (!expired.rows.length) return;
      await client.query(
        `UPDATE booking_requests SET status = 'expired', updated_at = NOW()
         WHERE id = ANY($1::uuid[])`,
        [expired.rows.map((r) => r.id)]
      );
      const byJourney = new Map<string, number>();
      for (const row of expired.rows) {
        byJourney.set(row.journey_id, (byJourney.get(row.journey_id) ?? 0) + row.seats_requested);
      }
      for (const [journeyId, seats] of byJourney) {
        await client.query(
          `UPDATE journeys SET available_seats = LEAST(total_seats, available_seats + $1)
           WHERE id = $2`,
          [seats, journeyId]
        );
      }
    });
  }

  /**
   * Atomically decrement available seats and create a booking request.
   */
  async requestBooking(data: {
    journeyId: string;
    passengerProfileId: string;
    seatsRequested: number;
    pickupName: string;
    pickupLat: number;
    pickupLng: number;
    dropoffName: string;
    dropoffLat: number;
    dropoffLng: number;
    paymentMethod: PaymentMethod;
    passengerNotes?: string;
  }): Promise<BookingRequestRow> {
    await this.expireStaleRequests({ journeyId: data.journeyId });
    return withTransaction(async (client) => {
      // Lock the journey row and check seats
      const journeyResult = await client.query(
        `SELECT j.*, v.vehicle_type, v.id AS vid
         FROM journeys j
         JOIN vehicles v ON v.id = j.vehicle_id
         WHERE j.id = $1 AND j.status IN ('scheduled', 'active')
           AND (j.status = 'active' OR j.departure_time > NOW())
           AND j.accepts_new_passengers = true
         FOR UPDATE`,
        [data.journeyId]
      );

      if (journeyResult.rows.length === 0) {
        throw new NotFoundError('Journey');
      }

      const journey = journeyResult.rows[0] as {
        id: string;
        driver_id: string;
        available_seats: number;
        total_distance_km: string;
        base_fare_per_km: string;
        vehicle_type: string;
        journey_type: string;
        minimum_fare: string;
      };

      if (journey.available_seats < data.seatsRequested) {
        throw new ValidationError('Not enough available seats');
      }

      // Requests must also lie along the journey in the driver's direction.
      const routeCheck = await client.query(
        `SELECT
          ST_DWithin(j.route_geometry::geography,
            ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $5) AS pickup_near,
          ST_DWithin(j.route_geometry::geography,
            ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography, $5) AS dropoff_near,
          ST_LineLocatePoint(j.route_geometry, ST_ClosestPoint(j.route_geometry,
            ST_SetSRID(ST_MakePoint($2, $1), 4326))) <
          ST_LineLocatePoint(j.route_geometry, ST_ClosestPoint(j.route_geometry,
            ST_SetSRID(ST_MakePoint($4, $3), 4326))) AS destination_position,
          ST_LineLocatePoint(j.route_geometry, ST_ClosestPoint(j.route_geometry,
            ST_SetSRID(ST_MakePoint($2, $1), 4326))) AS pickup_position,
          (j.status <> 'active' OR (dp.location_updated_at > NOW() - INTERVAL '30 seconds'
            AND ST_LineLocatePoint(j.route_geometry, ST_ClosestPoint(j.route_geometry,
              dp.current_location)) <= ST_LineLocatePoint(j.route_geometry,
                ST_ClosestPoint(j.route_geometry, ST_SetSRID(ST_MakePoint($2, $1), 4326))))) AS pickup_ahead
         FROM journeys j JOIN driver_profiles dp ON dp.id = j.driver_id WHERE j.id = $6`,
        [data.pickupLat, data.pickupLng, data.dropoffLat, data.dropoffLng,
          config.routing.maxDeviationMeters, data.journeyId]
      );
      const route = routeCheck.rows[0];
      if (!route?.pickup_near || !route?.dropoff_near || !route?.forward || !route?.pickup_ahead) {
        throw new ValidationError('Pickup and destination must follow the published route direction');
      }

      // Decrement seats
      await client.query(
        'UPDATE journeys SET available_seats = available_seats - $1 WHERE id = $2',
        [data.seatsRequested, data.journeyId]
      );

      // Estimate fare
      const routeDistanceKm = parseFloat(journey.total_distance_km) *
        Math.max(0, Number(route.destination_position) - Number(route.pickup_position));
      const fareEstimate = Math.max(
        Number(journey.minimum_fare),
        Number(journey.base_fare_per_km) > 0
          ? Number(journey.base_fare_per_km) * routeDistanceKm
          : estimateFareFromFraction(
              parseFloat(journey.total_distance_km), Number(route.pickup_position),
              Number(route.destination_position), journey.vehicle_type as 'auto_rickshaw',
              journey.journey_type as 'shared'
            )
      );

      const expiresAt = new Date(
        Date.now() + config.routing.bookingRequestTimeoutSeconds * 1000
      );

      const bookingResult = await client.query<BookingRequestRow>(
        `INSERT INTO booking_requests (
          journey_id, passenger_id, driver_id, seats_requested,
          pickup_name, pickup_location, dropoff_name, dropoff_location,
          fare_estimate, payment_method, passenger_notes, expires_at
        ) VALUES (
          $1, $2, $3, $4,
          $5, ST_SetSRID(ST_MakePoint($6, $7), 4326),
          $8, ST_SetSRID(ST_MakePoint($9, $10), 4326),
          $11, $12, $13, $14
        ) RETURNING *`,
        [
          data.journeyId,
          data.passengerProfileId,
          journey.driver_id,
          data.seatsRequested,
          data.pickupName,
          data.pickupLng,
          data.pickupLat,
          data.dropoffName,
          data.dropoffLng,
          data.dropoffLat,
          fareEstimate,
          data.paymentMethod,
          data.passengerNotes ?? null,
          expiresAt,
        ]
      );

      const booking = bookingResult.rows[0];

      // Notify driver via socket
      emitToDriver(journey.driver_id, 'booking:new_request', {
        bookingRequestId: booking.id,
        passengerId: data.passengerProfileId,
        seats: data.seatsRequested,
        fareEstimate,
        pickupName: data.pickupName,
        dropoffName: data.dropoffName,
        expiresAt: expiresAt.toISOString(),
      });

      return booking;
    });
  }

  async respondToBooking(data: {
    bookingRequestId: string;
    driverProfileId: string;
    accepted: boolean;
  }): Promise<ConfirmedBookingRow | BookingRequestRow> {
    return withTransaction(async (client) => {
      const reqResult = await client.query<BookingRequestRow>(
        `SELECT * FROM booking_requests WHERE id = $1 AND status = 'pending' FOR UPDATE`,
        [data.bookingRequestId]
      );

      if (reqResult.rows.length === 0) {
        throw new NotFoundError('Booking request');
      }

      const br = reqResult.rows[0];
      if (br.driver_id !== data.driverProfileId) {
        throw new AppError('Not authorized', 403);
      }

      if (br.expires_at && new Date(br.expires_at).getTime() <= Date.now()) {
        await client.query(
          `UPDATE booking_requests SET status = 'expired', updated_at = NOW() WHERE id = $1`,
          [data.bookingRequestId]
        );
        await client.query(
          `UPDATE journeys SET available_seats = LEAST(total_seats, available_seats + $1)
           WHERE id = $2`,
          [br.seats_requested, br.journey_id]
        );
        return { ...br, status: 'expired' as BookingStatus };
      }

      if (!data.accepted) {
        // Reject: restore seats
        await client.query(
          `UPDATE booking_requests SET status = 'rejected', updated_at = NOW() WHERE id = $1`,
          [data.bookingRequestId]
        );
        await client.query(
          `UPDATE journeys SET available_seats = available_seats + $1 WHERE id = $2`,
          [br.seats_requested, br.journey_id]
        );

        emitToPassenger(br.passenger_id, 'booking:rejected', {
          bookingRequestId: br.id,
        });

        return { ...br, status: 'rejected' as BookingStatus };
      }

      // Accept: update request status
      await client.query(
        `UPDATE booking_requests SET status = 'accepted', updated_at = NOW() WHERE id = $1`,
        [data.bookingRequestId]
      );

      // Create confirmed booking
      const cbResult = await client.query<ConfirmedBookingRow>(
        `INSERT INTO confirmed_bookings (
          request_id, journey_id, passenger_id, driver_id,
          seats_booked, confirmed_fare, pickup_name, pickup_location,
          dropoff_name, dropoff_location, payment_method
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10, $11
        ) RETURNING *`,
        [
          br.id,
          br.journey_id,
          br.passenger_id,
          br.driver_id,
          br.seats_requested,
          br.fare_estimate,
          br.pickup_name,
          br.pickup_location,
          br.dropoff_name,
          br.dropoff_location,
          br.payment_method,
        ]
      );

      const confirmed = cbResult.rows[0];

      emitToPassenger(br.passenger_id, 'booking:accepted', {
        bookingRequestId: br.id,
        confirmedBookingId: confirmed.id,
        fare: br.fare_estimate,
        driverId: data.driverProfileId,
      });

      return confirmed;
    });
  }

  async cancelBooking(bookingId: string, userId: string): Promise<void> {
    return withTransaction(async (client) => {
      const result = await client.query<ConfirmedBookingRow>(
        `SELECT cb.*, pp.user_id AS passenger_user_id
         FROM confirmed_bookings cb
         JOIN passenger_profiles pp ON pp.id = cb.passenger_id
         WHERE cb.id = $1 AND cb.status = 'confirmed'
         FOR UPDATE`,
        [bookingId]
      );

      if (result.rows.length === 0) throw new NotFoundError('Booking');

      const booking = result.rows[0] as ConfirmedBookingRow & {
        passenger_user_id: string;
      };

      if (booking.passenger_user_id !== userId) {
        throw new AppError('Not authorized to cancel this booking', 403);
      }

      await client.query(
        `UPDATE confirmed_bookings SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
        [bookingId]
      );
      await client.query(
        `UPDATE journeys SET available_seats = LEAST(total_seats, available_seats + $1) WHERE id = $2`,
        [booking.seats_booked, booking.journey_id]
      );
    });
  }

  async getPassengerBookings(
    passengerProfileId: string,
    page: number,
    limit: number
  ): Promise<{ bookings: unknown[]; total: number }> {
    const offset = (page - 1) * limit;
    const [rows, count] = await Promise.all([
      query<{
        id: string; journey_id: string; passenger_id: string; driver_id: string;
        driver_name: string; driver_phone: string; driver_rating: number;
        vehicle_type: string; vehicle_number: string; pickup_name: string;
        dropoff_name: string; seats_booked: number; confirmed_fare: string;
        payment_method: PaymentMethod; payment_status: string; status: string;
        departure_time: Date; created_at: Date;
      }>(
        `SELECT cb.id, cb.journey_id, cb.passenger_id, cb.driver_id,
           dp.full_name AS driver_name, u.phone AS driver_phone, dp.rating::float AS driver_rating,
           v.vehicle_type, v.registration_number AS vehicle_number,
           cb.pickup_name, cb.dropoff_name, cb.seats_booked, cb.confirmed_fare,
           cb.payment_method, cb.payment_status, cb.status, j.departure_time, cb.created_at
         FROM confirmed_bookings cb
         JOIN journeys j ON j.id = cb.journey_id
         JOIN driver_profiles dp ON dp.id = cb.driver_id
         JOIN users u ON u.id = dp.user_id
         JOIN vehicles v ON v.id = j.vehicle_id
         WHERE cb.passenger_id = $1
         ORDER BY cb.created_at DESC LIMIT $2 OFFSET $3`,
        [passengerProfileId, limit, offset]
      ),
      query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM confirmed_bookings WHERE passenger_id = $1',
        [passengerProfileId]
      ),
    ]);
    return {
      bookings: rows.rows.map((r) => ({
        id: r.id, journeyId: r.journey_id, passengerId: r.passenger_id,
        driverId: r.driver_id, driverName: r.driver_name, driverPhone: r.driver_phone,
        driverRating: r.driver_rating, vehicleType: r.vehicle_type,
        vehicleNumber: r.vehicle_number, fromAddress: r.pickup_name,
        toAddress: r.dropoff_name, seatsBooked: r.seats_booked,
        farePerSeat: Number(r.confirmed_fare) / r.seats_booked,
        totalFare: Number(r.confirmed_fare), paymentMethod: r.payment_method,
        paymentStatus: r.payment_status, status: r.status,
        departureTime: r.departure_time.toISOString(), createdAt: r.created_at.toISOString(),
      })),
      total: parseInt(count.rows[0].count, 10),
    };
  }

  async getDriverPendingBookings(driverProfileId: string): Promise<unknown[]> {
    await this.expireStaleRequests({ driverProfileId });
    const result = await query<{
      id: string; journey_id: string; passenger_name: string; passenger_phone: string;
      pickup_name: string; pickup_lat: number; pickup_lng: number;
      dropoff_name: string; dropoff_lat: number; dropoff_lng: number;
      seats_requested: number; fare_estimate: string; expires_at: Date; status: BookingStatus;
    }>(
      `SELECT br.id, br.journey_id, pp.full_name AS passenger_name, u.phone AS passenger_phone,
         br.pickup_name, ST_Y(br.pickup_location) AS pickup_lat,
         ST_X(br.pickup_location) AS pickup_lng, br.dropoff_name,
         ST_Y(br.dropoff_location) AS dropoff_lat, ST_X(br.dropoff_location) AS dropoff_lng,
         br.seats_requested, br.fare_estimate, br.expires_at, br.status
       FROM booking_requests br
       JOIN passenger_profiles pp ON pp.id = br.passenger_id
       JOIN users u ON u.id = pp.user_id
       WHERE br.driver_id = $1 AND br.status = 'pending' AND br.expires_at > NOW()
       ORDER BY br.created_at ASC`,
      [driverProfileId]
    );
    return result.rows.map((r) => ({
      id: r.id, journeyId: r.journey_id, passengerName: r.passenger_name,
      passengerPhone: r.passenger_phone, pickupName: r.pickup_name,
      pickupLat: r.pickup_lat, pickupLng: r.pickup_lng,
      dropoffName: r.dropoff_name, dropoffLat: r.dropoff_lat, dropoffLng: r.dropoff_lng,
      seats: r.seats_requested, fare: Number(r.fare_estimate),
      expiresAt: r.expires_at.toISOString(), status: r.status,
    }));
  }

  async markPickedUp(bookingId: string, driverProfileId: string): Promise<ConfirmedBookingRow> {
    const result = await query<ConfirmedBookingRow>(
      `UPDATE confirmed_bookings
       SET status = 'picked_up', pickup_time = NOW(), updated_at = NOW()
       WHERE id = $1 AND driver_id = $2 AND status = 'confirmed'
       RETURNING *`,
      [bookingId, driverProfileId]
    );
    if (result.rows.length === 0) throw new NotFoundError('Booking');
    return result.rows[0];
  }

  async completeBooking(bookingId: string, driverProfileId: string): Promise<ConfirmedBookingRow> {
    return withTransaction(async (client) => {
      const result = await client.query<ConfirmedBookingRow>(
        `UPDATE confirmed_bookings
         SET status = 'completed', dropoff_time = NOW(), updated_at = NOW()
         WHERE id = $1 AND driver_id = $2 AND status = 'picked_up'
         RETURNING *`,
        [bookingId, driverProfileId]
      );
      if (result.rows.length === 0) throw new NotFoundError('Booking');

      const booking = result.rows[0];
      if (booking.payment_status === 'paid') {
        const fare = parseFloat(booking.confirmed_fare);
        const commission = (fare * config.business.platformCommissionPct) / 100;
        await client.query(
          `INSERT INTO driver_earnings (driver_id, booking_id, journey_id, gross_amount, platform_fee, net_amount)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT DO NOTHING`,
          [booking.driver_id, booking.id, booking.journey_id, fare, commission, fare - commission]
        );
      }

      // Increment total_rides for passenger
      await client.query(
        `UPDATE passenger_profiles SET total_rides = total_rides + 1 WHERE id = $1`,
        [booking.passenger_id]
      );

      return booking;
    });
  }

  async submitReview(data: {
    bookingId: string;
    passengerProfileId: string;
    rating: number;
    comment?: string;
  }): Promise<void> {
    return withTransaction(async (client) => {
      const result = await client.query<ConfirmedBookingRow>(
        `SELECT * FROM confirmed_bookings WHERE id = $1 AND passenger_id = $2 AND status = 'completed'`,
        [data.bookingId, data.passengerProfileId]
      );
      if (result.rows.length === 0) throw new NotFoundError('Completed booking');

      const booking = result.rows[0];

      const identities = await client.query<{ passenger_user_id: string; driver_user_id: string }>(
        `SELECT pp.user_id AS passenger_user_id, dp.user_id AS driver_user_id
         FROM passenger_profiles pp, driver_profiles dp
         WHERE pp.id = $1 AND dp.id = $2`,
        [booking.passenger_id, booking.driver_id]
      );
      if (!identities.rows[0]) throw new NotFoundError('Booking participants');

      // Insert review
      await client.query(
        `INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, reviewer_role, rating, comment)
         VALUES ($1, $2, $3, 'passenger', $4, $5)
         ON CONFLICT (booking_id) DO NOTHING`,
        [booking.id, identities.rows[0].passenger_user_id, identities.rows[0].driver_user_id,
          data.rating, data.comment ?? null]
      );
    });
  }
}
