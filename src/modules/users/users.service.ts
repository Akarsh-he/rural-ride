import { query } from '../../config/database';

export class UsersService {
  async getMe(userId: string) {
    const res = await query(
      `SELECT u.id, u.phone, u.username, u.name, u.role, u.status, u.phone_verified,
              u.preferred_language, u.created_at, u.updated_at, u.last_login_at,
              dp.id as driver_profile_id, dp.verification_status, dp.full_name as driver_name,
              pp.id as passenger_profile_id, pp.full_name as passenger_name
       FROM users u
       LEFT JOIN driver_profiles dp ON dp.user_id = u.id
       LEFT JOIN passenger_profiles pp ON pp.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    );
    return res.rows[0] || null;
  }

  async updateLanguage(userId: string, language: 'hi' | 'en'): Promise<void> {
    await query("UPDATE users SET preferred_language = $1, updated_at = NOW() WHERE id = $2", [language, userId]);
  }

  async deleteAccount(userId: string): Promise<void> {
    await query("UPDATE users SET status = 'deleted', updated_at = NOW() WHERE id = $1", [userId]);
  }
}
