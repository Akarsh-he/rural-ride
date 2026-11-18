import { query } from '../../config/database';
import { config } from '../../config/env';
import { NotFoundError, AppError, ValidationError, ForbiddenError, ConflictError } from '../../middleware/errorHandler';
import { JourneyRow, JourneyStatus, SearchParams, MatchedJourney, VehicleType } from '../../types';
import { estimateFareFromFraction } from '../../utils/fare-calculator';

export class JourneysService {
  async searchNearbyJourneys(lat: number, lng: number, maxResults = 10): Promise<MatchedJourney[]> {
    const result = await query<{
      journey_id: string; driver_name: string; driver_photo: string | null;
      driver_rating: number; vehicle_type: VehicleType; registration_number: string;
      origin_name: string; destination_name: string; waypoints: unknown[];
      available_seats: number; departure_time: Date; estimated_arrival_time: Date | null;
      base_fare_per_km: number; minimum_fare: number; total_distance_km: number;
      pickup_distance_meters: number; driver_lat: number; driver_lng: number;
    }>(
      `SELECT j.id AS journey_id, dp.full_name AS driver_name,
        dp.profile_photo_url AS driver_photo, dp.rating::float AS driver_rating,
        v.vehicle_type, v.registration_number, j.origin_name, j.destination_name,
        j.waypoints, j.available_seats, j.departure_time, j.estimated_arrival_time,
        j.base_fare_per_km::float, j.minimum_fare::float, j.total_distance_km::float,
        ST_Distance(dp.current_location::geography,
          ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) AS pickup_distance_meters,
        ST_Y(dp.current_location) AS driver_lat, ST_X(dp.current_location) AS driver_lng
       FROM journeys j
       JOIN driver_profiles dp ON dp.id = j.driver_id
       JOIN vehicles v ON v.id = j.vehicle_id
       WHERE j.status = 'active' AND j.available_seats > 0
         AND j.accepts_new_passengers = true AND dp.is_verified = true
         AND v.is_active = true
         AND dp.location_updated_at > NOW() - INTERVAL '30 seconds'
         AND ST_DWithin(dp.current_location::geography,
           ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, 3000)
       ORDER BY pickup_distance_meters ASC LIMIT $3`,
      [lat, lng, maxResults]
    );
    return result.rows.map((r) => ({
      journeyId: r.journey_id, driverName: r.driver_name, driverPhoto: r.driver_photo,
      driverRating: r.driver_rating, vehicleType: r.vehicle_type,
      registrationNumber: r.registration_number, originName: r.origin_name,
      destinationName: r.destination_name, waypoints: r.waypoints,
      availableSeats: r.available_seats, departureTime: r.departure_time.toISOString(),
      estimatedPickupTime: null, estimatedDropoffTime: r.estimated_arrival_time?.toISOString() ?? null,
      pickupDistanceMeters: Math.round(r.pickup_distance_meters),
      fareEstimate: Math.max(r.minimum_fare, r.base_fare_per_km * r.total_distance_km),
      compatibilityScore: 1, driverCurrentLocation: { lat: r.driver_lat, lng: r.driver_lng },
    }));
  }

  /**
   * Search journeys using PostGIS ST_DWithin on route_geometry.
   * Finds journeys whose route passes near both the pickup and destination points.
   */
  async searchJourneys(params: SearchParams): Promise<MatchedJourney[]> {
    const {
      pickupLat,
      pickupLng,
      destinationLat,
      destinationLng,
      seatsNeeded,
      maxDeviationMeters = config.routing.maxDeviationMeters,
      vehicleTypes,
      maxResults = 20,
    } = params;

    const vehicleFilter =
      vehicleTypes && vehicleTypes.length > 0
        ? `AND v.vehicle_type = ANY($7::text[])`
        : '';

    const queryParams: unknown[] = [
      pickupLng,
      pickupLat,
      maxDeviationMeters,
      destinationLng,
      destinationLat,
      seatsNeeded,
    ];

    if (vehicleTypes && vehicleTypes.length > 0) {
      queryParams.push(vehicleTypes);
    }

    queryParams.push(maxResults);
    const limitParam = `$${queryParams.length}`;

    const sql = `
      SELECT
        j.id                        AS journey_id,
        dp.full_name                AS driver_name,
        dp.profile_photo_url        AS driver_photo,
        dp.rating::float            AS driver_rating,
        v.vehicle_type,
        v.registration_number,
        j.origin_name,
        j.destination_name,
        j.waypoints,
        j.available_seats,
        j.departure_time,
        j.estimated_arrival_time,
        j.base_fare_per_km::float,
        j.minimum_fare::float,
        j.total_distance_km::float,
        ST_Distance(
          j.route_geometry::geography,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
        ) AS pickup_distance_meters,
        ST_LineLocatePoint(j.route_geometry, ST_ClosestPoint(
          j.route_geometry, ST_SetSRID(ST_MakePoint($1, $2), 4326)
        )) AS pickup_position,
        ST_LineLocatePoint(j.route_geometry, ST_ClosestPoint(
          j.route_geometry, ST_SetSRID(ST_MakePoint($4, $5), 4326)
        )) AS destination_position
      FROM journeys j
      JOIN driver_profiles dp ON dp.id = j.driver_id
      JOIN vehicles v          ON v.id  = j.vehicle_id
      WHERE j.status IN ('scheduled', 'active')
        AND j.available_seats >= $6
        AND j.accepts_new_passengers = true
        AND (j.status = 'active' OR j.departure_time > NOW())
        AND (j.status <> 'active' OR dp.location_updated_at > NOW() - INTERVAL '30 seconds')
        AND dp.is_verified = true
        AND v.is_active = true
        AND ST_DWithin(
          j.route_geometry::geography,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          $3
        )
        AND ST_LineLocatePoint(j.route_geometry, ST_ClosestPoint(
          j.route_geometry, ST_SetSRID(ST_MakePoint($1, $2), 4326)
        )) < ST_LineLocatePoint(j.route_geometry, ST_ClosestPoint(
          j.route_geometry, ST_SetSRID(ST_MakePoint($4, $5), 4326)
        ))
        AND (j.status <> 'active' OR ST_LineLocatePoint(j.route_geometry,
          ST_ClosestPoint(j.route_geometry, dp.current_location)) <=
          ST_LineLocatePoint(j.route_geometry, ST_ClosestPoint(j.route_geometry,
            ST_SetSRID(ST_MakePoint($1, $2), 4326))))
        AND ST_DWithin(
          j.route_geometry::geography,
          ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography,
          $3
        )
        ${vehicleFilter}
      ORDER BY pickup_distance_meters ASC, j.departure_time ASC
      LIMIT ${limitParam}
    `;

    const result = await query<{
      journey_id: string;
      driver_name: string;
      driver_photo: string | null;
      driver_rating: number;
      vehicle_type: VehicleType;
      registration_number: string;
      origin_name: string;
      destination_name: string;
      waypoints: unknown[];
      available_seats: number;
      departure_time: Date;
      estimated_arrival_time: Date | null;
      base_fare_per_km: number;
      minimum_fare: number;
      total_distance_km: number;
      pickup_distance_meters: number;
      pickup_position: number;
      destination_position: number;
    }>(sql, queryParams);

    return result.rows.map((r) => ({
      journeyId: r.journey_id,
      driverName: r.driver_name,
      driverPhoto: r.driver_photo,
      driverRating: r.driver_rating,
      vehicleType: r.vehicle_type,
      registrationNumber: r.registration_number,
      originName: r.origin_name,
      destinationName: r.destination_name,
      waypoints: r.waypoints,
      availableSeats: r.available_seats,
      departureTime: r.departure_time.toISOString(),
      estimatedPickupTime: null,
      estimatedDropoffTime: r.estimated_arrival_time?.toISOString() ?? null,
      pickupDistanceMeters: Math.round(r.pickup_distance_meters),
      fareEstimate: Math.max(
        r.minimum_fare,
        r.base_fare_per_km > 0
          ? r.base_fare_per_km * r.total_distance_km * Math.max(0, r.destination_position - r.pickup_position)
          : estimateFareFromFraction(r.total_distance_km, r.pickup_position,
              r.destination_position, r.vehicle_type, 'shared')
      ),
      compatibilityScore: 1 - r.pickup_distance_meters / (maxDeviationMeters * 2),
    }));
  }

  async createJourney(driverProfileId: string, data: Partial<JourneyRow>): Promise<JourneyRow> {
    const driverVehicle = await query<{ is_verified: boolean; max_passengers: number; is_active: boolean }>(
      `SELECT dp.is_verified, v.max_passengers, v.is_active
       FROM driver_profiles dp JOIN vehicles v ON v.driver_id = dp.id
       WHERE dp.id = $1 AND v.id = $2`,
      [driverProfileId, data.vehicle_id]
    );
    if (driverVehicle.rows.length === 0) throw new NotFoundError('Driver vehicle');
    if (!driverVehicle.rows[0].is_verified) throw new ForbiddenError('Driver verification is required before publishing a journey');
    if (!driverVehicle.rows[0].is_active) throw new ValidationError('Selected vehicle is inactive');
    if ((data.total_seats ?? 1) > driverVehicle.rows[0].max_passengers) {
      throw new ValidationError('Journey seats cannot exceed registered vehicle capacity');
    }

    const result = await query<JourneyRow>(
      `INSERT INTO journeys (
        driver_id, vehicle_id, journey_type, origin_name, origin_location,
        destination_name, destination_location, route_geometry, waypoints,
        total_distance_km, departure_time, estimated_arrival_time,
        total_seats, available_seats, base_fare_per_km, minimum_fare,
        accepts_new_passengers, notes
      ) VALUES (
        $1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326),
        $7, ST_SetSRID(ST_MakePoint($8, $9), 4326),
        CASE WHEN $10::text IS NULL THEN NULL ELSE ST_SetSRID(ST_GeomFromGeoJSON($10::text), 4326) END, $11,
        $12, $13, $14,
        $15, $15, $16, $17,
        $18, $19
      ) RETURNING *`,
      [
        driverProfileId,
        data.vehicle_id,
        data.journey_type ?? 'shared',
        data.origin_name,
        (data.origin_location as { lng: number } | undefined)?.lng ?? 0,
        (data.origin_location as { lat: number } | undefined)?.lat ?? 0,
        data.destination_name,
        (data.destination_location as { lng: number } | undefined)?.lng ?? 0,
        (data.destination_location as { lat: number } | undefined)?.lat ?? 0,
        data.route_geometry ?? null,
        JSON.stringify(data.waypoints ?? []),
        data.total_distance_km ?? 0,
        data.departure_time,
        data.estimated_arrival_time ?? null,
        data.total_seats ?? 1,
        data.base_fare_per_km ?? 0,
        data.minimum_fare ?? 0,
        data.accepts_new_passengers ?? true,
        data.notes ?? null,
      ]
    );
    return result.rows[0];
  }

  async getJourney(journeyId: string): Promise<JourneyRow> {
    const result = await query<JourneyRow>(
      'SELECT * FROM journeys WHERE id = $1',
      [journeyId]
    );
    if (result.rows.length === 0) throw new NotFoundError('Journey');
    return result.rows[0];
  }

  async updateJourneyStatus(
    journeyId: string,
    driverProfileId: string,
    status: JourneyStatus
  ): Promise<JourneyRow> {
    const journey = await this.getJourney(journeyId);
    if (journey.driver_id !== driverProfileId) {
      throw new AppError('Not authorized to update this journey', 403);
    }

    const validTransitions: Record<JourneyStatus, JourneyStatus[]> = {
      scheduled: ['active', 'cancelled'],
      active: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };

    if (!validTransitions[journey.status].includes(status)) {
      throw new ValidationError(
        `Cannot transition from ${journey.status} to ${status}`
      );
    }

    if (status === 'active') {
      const verified = await query<{ is_verified: boolean }>(
        'SELECT is_verified FROM driver_profiles WHERE id = $1', [driverProfileId]
      );
      if (!verified.rows[0]?.is_verified) throw new ForbiddenError('Driver verification is required to start a journey');
    }

    const extraCols =
      status === 'active'
        ? ', actual_start_time = NOW()'
        : status === 'completed'
        ? ', actual_end_time = NOW()'
        : '';

    const result = await query<JourneyRow>(
      `UPDATE journeys SET status = $1${extraCols}, updated_at = NOW()
       WHERE id = $2 AND driver_id = $3 AND status = $4 RETURNING *`,
      [status, journeyId, driverProfileId, journey.status]
    );
    if (result.rows.length === 0) throw new ConflictError('Journey status changed; refresh and try again');
    return result.rows[0];
  }

  async getDriverActiveJourney(driverProfileId: string): Promise<JourneyRow | null> {
    const result = await query<JourneyRow>(
      `SELECT * FROM journeys WHERE driver_id = $1 AND status = 'active' LIMIT 1`,
      [driverProfileId]
    );
    return result.rows[0] ?? null;
  }

  async listDriverJourneys(
    driverProfileId: string,
    page: number,
    limit: number
  ): Promise<{ journeys: JourneyRow[]; total: number }> {
    const offset = (page - 1) * limit;
    const [journeysResult, countResult] = await Promise.all([
      query<JourneyRow>(
        `SELECT * FROM journeys WHERE driver_id = $1
         ORDER BY departure_time DESC LIMIT $2 OFFSET $3`,
        [driverProfileId, limit, offset]
      ),
      query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM journeys WHERE driver_id = $1',
        [driverProfileId]
      ),
    ]);
    return {
      journeys: journeysResult.rows,
      total: parseInt(countResult.rows[0].count, 10),
    };
  }
}
