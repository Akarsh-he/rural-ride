import { query } from '../../config/database';
import { NotFoundError } from '../../middleware/errorHandler';
import { PassengerProfileRow, ConfirmedBookingRow } from '../../types';

export class PassengersService {
  async getProfile(passengerProfileId: string): Promise<PassengerProfileRow> {
    const result = await query<PassengerProfileRow>(
      `SELECT pp.*, u.phone, u.email, u.preferred_language
       FROM passenger_profiles pp
       JOIN users u ON u.id = pp.user_id
       WHERE pp.id = $1`,
      [passengerProfileId]
    );
    if (result.rows.length === 0) throw new NotFoundError('Passenger profile');
    return result.rows[0];
  }

  async updateProfile(
    passengerProfileId: string,
    data: Partial<Pick<PassengerProfileRow, 'full_name' | 'profile_photo_url' | 'home_address'>>
  ): Promise<PassengerProfileRow> {
    const result = await query<PassengerProfileRow>(
      `UPDATE passenger_profiles
       SET full_name         = COALESCE($1, full_name),
           profile_photo_url = COALESCE($2, profile_photo_url),
           home_address      = COALESCE($3, home_address),
           updated_at        = NOW()
       WHERE id = $4
       RETURNING *`,
      [
        data.full_name ?? null,
        data.profile_photo_url ?? null,
        data.home_address ?? null,
        passengerProfileId,
      ]
    );
    if (result.rows.length === 0) throw new NotFoundError('Passenger profile');
    return result.rows[0];
  }

  async addEmergencyContact(
    passengerProfileId: string,
    contact: { name: string; phone: string }
  ): Promise<PassengerProfileRow> {
    const result = await query<PassengerProfileRow>(
      `UPDATE passenger_profiles
       SET emergency_contacts = emergency_contacts || $1::jsonb,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(contact), passengerProfileId]
    );
    if (result.rows.length === 0) throw new NotFoundError('Passenger profile');
    return result.rows[0];
  }

  async removeEmergencyContact(
    passengerProfileId: string,
    contactPhone: string
  ): Promise<PassengerProfileRow> {
    // Remove the contact with matching phone from the JSON array
    const result = await query<PassengerProfileRow>(
      `UPDATE passenger_profiles
       SET emergency_contacts = (
         SELECT jsonb_agg(c)
         FROM jsonb_array_elements(emergency_contacts) AS c
         WHERE c->>'phone' != $1
       ),
       updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [contactPhone, passengerProfileId]
    );
    if (result.rows.length === 0) throw new NotFoundError('Passenger profile');
    return result.rows[0];
  }

  async getRideHistory(
    passengerProfileId: string,
    page: number,
    limit: number
  ): Promise<{ rides: ConfirmedBookingRow[]; total: number }> {
    const offset = (page - 1) * limit;
    const [ridesResult, countResult] = await Promise.all([
      query<ConfirmedBookingRow>(
        `SELECT cb.*, j.origin_name, j.destination_name, j.departure_time,
                dp.full_name AS driver_name, v.vehicle_type
         FROM confirmed_bookings cb
         JOIN journeys j ON j.id = cb.journey_id
         JOIN driver_profiles dp ON dp.id = cb.driver_id
         JOIN vehicles v ON v.driver_id = dp.id AND v.is_active = true
         WHERE cb.passenger_id = $1
         ORDER BY cb.created_at DESC
         LIMIT $2 OFFSET $3`,
        [passengerProfileId, limit, offset]
      ),
      query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM confirmed_bookings WHERE passenger_id = $1',
        [passengerProfileId]
      ),
    ]);
    return {
      rides: ridesResult.rows,
      total: parseInt(countResult.rows[0].count, 10),
    };
  }
}
