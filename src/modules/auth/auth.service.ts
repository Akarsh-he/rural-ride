import { query, withTransaction } from '../../config/database';
import { verifyIdToken, getFirebaseUser } from '../../config/firebase';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';
import { UserRole } from '../../types';

interface RegisterPayload {
  idToken: string;
  role: UserRole;
  phone: string;
  language?: string;
}

interface AuthResult {
  userId: string;
  role: UserRole;
  isNewUser: boolean;
  driverProfileId?: string;
  passengerProfileId?: string;
}

export class AuthService {
  /**
   * Verify Firebase token and upsert user + profile in one transaction.
   */
  async verifyAndRegister(payload: RegisterPayload): Promise<AuthResult> {
    const { idToken, role, phone, language = 'hi' } = payload;

    // Verify the Firebase token or fallback to phone-based UID
    const decoded = await verifyIdToken(idToken);
    const firebaseUid = decoded ? decoded.uid : `phone_${phone.replace(/\D/g, '')}`;

    return withTransaction(async (client) => {
      // Check if user already exists
      const existing = await client.query(
        `SELECT u.id, u.role,
                dp.id AS driver_profile_id,
                pp.id AS passenger_profile_id
         FROM users u
         LEFT JOIN driver_profiles dp ON dp.user_id = u.id
         LEFT JOIN passenger_profiles pp ON pp.user_id = u.id
         WHERE u.firebase_uid = $1`,
        [firebaseUid]
      );

      if (existing.rows.length > 0) {
        const u = existing.rows[0] as {
          id: string;
          role: UserRole;
          driver_profile_id?: string;
          passenger_profile_id?: string;
        };
        // Update last_seen
        await client.query('UPDATE users SET last_seen_at = NOW() WHERE id = $1', [u.id]);
        return {
          userId: u.id,
          role: u.role,
          isNewUser: false,
          driverProfileId: u.driver_profile_id,
          passengerProfileId: u.passenger_profile_id,
        };
      }

      // Fetch Firebase user for display name
      const firebaseUser = await getFirebaseUser(firebaseUid).catch(() => null);
      const displayName = firebaseUser?.displayName || null;
      const photoURL = firebaseUser?.photoURL || null;

      // Create user record
      const userResult = await client.query(
        `INSERT INTO users (firebase_uid, phone, role, preferred_language, status, phone_verified)
         VALUES ($1, $2, $3, $4, 'active', true)
         RETURNING id`,
        [firebaseUid, phone, role, language]
      );
      const userId = (userResult.rows[0] as { id: string }).id;

      let driverProfileId: string | undefined;
      let passengerProfileId: string | undefined;

      if (role === 'driver') {
        const driverResult = await client.query(
          `INSERT INTO driver_profiles (user_id, full_name, profile_photo_url)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [userId, displayName, photoURL]
        );
        driverProfileId = (driverResult.rows[0] as { id: string }).id;
      } else if (role === 'passenger') {
        const passengerResult = await client.query(
          `INSERT INTO passenger_profiles (user_id, full_name, profile_photo_url)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [userId, displayName, photoURL]
        );
        passengerProfileId = (passengerResult.rows[0] as { id: string }).id;
      }

      logger.info('New user registered', { userId, role });

      return {
        userId,
        role,
        isNewUser: true,
        driverProfileId,
        passengerProfileId,
      };
    });
  }

  /** Refresh session — just re-verify the token */
  async refreshSession(idToken: string): Promise<{ userId: string; role: UserRole }> {
    const decoded = await verifyIdToken(idToken);
    const firebaseUid = decoded ? decoded.uid : (idToken.startsWith('phone_') ? idToken : `phone_${idToken}`);

    const result = await query(
      'SELECT id, role FROM users WHERE firebase_uid = $1 AND status = $2',
      [decoded.uid, 'active']
    );

    if (result.rows.length === 0) {
      throw new AppError('User not found or suspended', 401);
    }

    const user = result.rows[0] as { id: string; role: UserRole };
    return { userId: user.id, role: user.role };
  }
}
