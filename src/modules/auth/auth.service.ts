import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { query, withTransaction } from '../../config/database';
import { verifyIdToken, getFirebaseUser } from '../../config/firebase';
import { config } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';
import { UserRole } from '../../types';
import { sendSmsOtp } from '../../utils/sms';

interface RegisterPayload {
  idToken: string;
  role: UserRole;
  phone: string;
  language?: string;
  username?: string;
}

interface AuthResult {
  userId: string;
  role: UserRole;
  isNewUser: boolean;
  driverProfileId?: string;
  passengerProfileId?: string;
  token?: string;
  username?: string;
  phone?: string;
}

export class AuthService {
  /**
   * Helper to hash an OTP with a secret pepper to prevent rainbow table attacks.
   */
  private hashOtp(otp: string): string {
    return crypto.createHash('sha256').update(otp + config.jwtSecret).digest('hex');
  }

  /**
   * Normalizes Indian phone numbers to E.164 (+91XXXXXXXXXX) format.
   */
  public normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      return `+91${digits}`;
    }
    if (digits.length === 12 && digits.startsWith('91')) {
      return `+${digits}`;
    }
    if (digits.length === 13 && digits.startsWith('091')) {
      return `+${digits.slice(1)}`;
    }
    throw new AppError('Invalid Indian mobile phone number. Must be 10 digits.', 400);
  }

  /**
   * Send a real 6-digit SMS OTP with rate limiting and cooldown.
   */
  async sendPhoneOtp(rawPhone: string): Promise<{ success: boolean; cooldownSeconds: number; message: string }> {
    const phone = this.normalizePhone(rawPhone);

    // 1. Cooldown check: Has an OTP been sent to this phone in the last 45 seconds?
    const recentOtp = await query(
      `SELECT created_at, expires_at 
       FROM phone_otps 
       WHERE phone = $1 AND created_at > NOW() - INTERVAL '45 seconds'
       ORDER BY created_at DESC LIMIT 1`,
      [phone]
    );

    if (recentOtp.rows.length > 0) {
      const elapsed = Math.floor((Date.now() - new Date(recentOtp.rows[0].created_at).getTime()) / 1000);
      const remaining = Math.max(1, 45 - elapsed);
      throw new AppError(`Please wait ${remaining} seconds before requesting a new OTP.`, 429);
    }

    // 2. Hourly rate limit check (max 10 requests per hour)
    const hourlyCount = await query(
      `SELECT count(*) FROM phone_otps WHERE phone = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [phone]
    );
    if (parseInt(hourlyCount.rows[0].count, 10) >= 10) {
      throw new AppError('Too many OTP requests for this number today. Please try again later.', 429);
    }

    // 3. Generate secure cryptographic 6-digit OTP
    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = this.hashOtp(otp);

    // 4. Save to phone_otps table with 5-minute expiry
    await query(
      `INSERT INTO phone_otps (phone, otp_hash, attempts, verified, expires_at, created_at)
       VALUES ($1, $2, 0, false, NOW() + INTERVAL '5 minutes', NOW())`,
      [phone, otpHash]
    );

    // 5. Dispatch SMS
    await sendSmsOtp(phone, otp);

    logger.info('Phone OTP generated and dispatched', { phone });
    return {
      success: true,
      cooldownSeconds: 45,
      message: 'OTP sent successfully to your mobile number',
    };
  }

  /**
   * Verify an OTP and retrieve or initiate user session.
   */
  async verifyPhoneOtp(
    rawPhone: string,
    otp: string,
    role: UserRole = 'passenger'
  ): Promise<{
    isNewUser: boolean;
    token: string;
    userId: string;
    phone: string;
    username?: string;
    role: UserRole;
    driverProfileId?: string;
    passengerProfileId?: string;
  }> {
    const phone = this.normalizePhone(rawPhone);
    const cleanOtp = otp.trim();

    if (!/^\d{6}$/.test(cleanOtp)) {
      throw new AppError('Invalid OTP format. Must be 6 digits.', 400);
    }

    // 1. Find latest active OTP for this phone
    const res = await query(
      `SELECT id, otp_hash, attempts, verified, expires_at 
       FROM phone_otps 
       WHERE phone = $1 AND verified = false AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [phone]
    );

    if (res.rows.length === 0) {
      throw new AppError('OTP has expired or was not requested. Please request a new OTP.', 400);
    }

    const otpRecord = res.rows[0];

    if (otpRecord.attempts >= 5) {
      throw new AppError('Too many incorrect attempts. Please request a new OTP.', 429);
    }

    // 2. Validate hash
    const enteredHash = this.hashOtp(cleanOtp);
    if (enteredHash !== otpRecord.otp_hash) {
      await query('UPDATE phone_otps SET attempts = attempts + 1 WHERE id = $1', [otpRecord.id]);
      throw new AppError('Incorrect OTP. Please enter the 6-digit code received on your phone.', 400);
    }

    // 3. Mark OTP as verified
    await query('UPDATE phone_otps SET verified = true WHERE id = $1', [otpRecord.id]);

    // 4. Query user in users table
    const userRes = await query(
      `SELECT u.id, u.phone, u.username, u.role, u.status,
              dp.id AS driver_profile_id,
              pp.id AS passenger_profile_id
       FROM users u
       LEFT JOIN driver_profiles dp ON dp.user_id = u.id
       LEFT JOIN passenger_profiles pp ON pp.user_id = u.id
       WHERE u.phone = $1`,
      [phone]
    );

    let user = userRes.rows[0];

    // If existing user WITH username -> return active session
    if (user && user.username) {
      await query('UPDATE users SET last_login_at = NOW(), last_seen_at = NOW(), phone_verified = true WHERE id = $1', [user.id]);

      const token = jwt.sign(
        { userId: user.id, phone: user.phone, role: user.role },
        config.jwtSecret,
        { expiresIn: '30d' }
      );

      return {
        isNewUser: false,
        token,
        userId: user.id,
        phone: user.phone,
        username: user.username,
        role: user.role,
        driverProfileId: user.driver_profile_id,
        passengerProfileId: user.passenger_profile_id,
      };
    }

    // If user does not exist at all, create user row
    let userId: string;
    if (!user) {
      const newUser = await query(
        `INSERT INTO users (phone, role, status, phone_verified, preferred_language, created_at, updated_at, last_login_at)
         VALUES ($1, $2, 'active', true, 'hi', NOW(), NOW(), NOW())
         RETURNING id, phone, role`,
        [phone, role]
      );
      userId = newUser.rows[0].id;
      user = newUser.rows[0];
    } else {
      userId = user.id;
      await query('UPDATE users SET phone_verified = true, last_login_at = NOW() WHERE id = $1', [userId]);
    }

    // New user needing username creation
    const provisionalToken = jwt.sign(
      { userId, phone, role: user.role || role, pendingUsername: true },
      config.jwtSecret,
      { expiresIn: '1d' }
    );

    return {
      isNewUser: true,
      token: provisionalToken,
      userId,
      phone,
      role: user.role || role,
      driverProfileId: user.driver_profile_id,
      passengerProfileId: user.passenger_profile_id,
    };
  }

  /**
   * Check if a username is available.
   */
  async checkUsernameAvailable(username: string): Promise<{ available: boolean; message: string }> {
    const clean = username.trim();
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(clean)) {
      return {
        available: false,
        message: 'Username must be 3-30 characters with letters, numbers, or underscores only.',
      };
    }

    const check = await query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [clean]);
    if (check.rows.length > 0) {
      return { available: false, message: 'Username is already taken.' };
    }

    return { available: true, message: 'Username is available.' };
  }

  /**
   * Complete user registration by setting a unique username and creating role profile.
   */
  async completeUsername(
    userId: string,
    username: string,
    roleOverride?: UserRole
  ): Promise<{
    token: string;
    user: {
      id: string;
      phone: string;
      username: string;
      role: UserRole;
      driverProfileId?: string;
      passengerProfileId?: string;
    };
  }> {
    const clean = username.trim();
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(clean)) {
      throw new AppError('Username must be 3-30 characters with letters, numbers, or underscores only.', 400);
    }

    // Check uniqueness across platform
    const existing = await query('SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id != $2', [clean, userId]);
    if (existing.rows.length > 0) {
      throw new AppError('Username is already taken. Please choose another username.', 409);
    }

    return withTransaction(async (client) => {
      const userRes = await client.query('SELECT id, phone, role FROM users WHERE id = $1', [userId]);
      if (userRes.rows.length === 0) {
        throw new AppError('User account not found.', 404);
      }

      const current = userRes.rows[0];
      const role: UserRole = roleOverride || current.role || 'passenger';

      // Update users table
      await client.query(
        `UPDATE users 
         SET username = $1, name = COALESCE(name, $1), role = $2, updated_at = NOW(), last_login_at = NOW()
         WHERE id = $3`,
        [clean, role, userId]
      );

      let driverProfileId: string | undefined;
      let passengerProfileId: string | undefined;

      if (role === 'driver') {
        const dp = await client.query(
          `INSERT INTO driver_profiles (user_id, full_name, created_at, updated_at)
           VALUES ($1, $2, NOW(), NOW())
           ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name
           RETURNING id`,
          [userId, clean]
        );
        driverProfileId = dp.rows[0].id;
      } else {
        const pp = await client.query(
          `INSERT INTO passenger_profiles (user_id, full_name, created_at, updated_at)
           VALUES ($1, $2, NOW(), NOW())
           ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name
           RETURNING id`,
          [userId, clean]
        );
        passengerProfileId = pp.rows[0].id;
      }

      const token = jwt.sign(
        { userId, phone: current.phone, role },
        config.jwtSecret,
        { expiresIn: '30d' }
      );

      logger.info('Username created and profile completed', { userId, username: clean, role });

      return {
        token,
        user: {
          id: userId,
          phone: current.phone,
          username: clean,
          role,
          driverProfileId,
          passengerProfileId,
        },
      };
    });
  }

  /**
   * Backward-compatible verifyAndRegister for existing clients and tokens.
   */
  async verifyAndRegister(payload: RegisterPayload): Promise<AuthResult> {
    const { idToken, role, phone, language = 'hi', username } = payload;

    const decoded = await verifyIdToken(idToken).catch(() => null);
    const firebaseUid = decoded ? decoded.uid : `phone_${phone.replace(/\D/g, '')}`;

    return withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT u.id, u.phone, u.username, u.role,
                dp.id AS driver_profile_id,
                pp.id AS passenger_profile_id
         FROM users u
         LEFT JOIN driver_profiles dp ON dp.user_id = u.id
         LEFT JOIN passenger_profiles pp ON pp.user_id = u.id
         WHERE u.firebase_uid = $1 OR u.phone = $2`,
        [firebaseUid, phone]
      );

      if (existing.rows.length > 0) {
        const u = existing.rows[0];
        await client.query('UPDATE users SET last_seen_at = NOW(), last_login_at = NOW() WHERE id = $1', [u.id]);
        const token = jwt.sign(
          { userId: u.id, phone: u.phone, role: u.role },
          config.jwtSecret,
          { expiresIn: '30d' }
        );
        return {
          userId: u.id,
          phone: u.phone,
          username: u.username,
          role: u.role,
          isNewUser: !u.username,
          driverProfileId: u.driver_profile_id,
          passengerProfileId: u.passenger_profile_id,
          token,
        };
      }

      const firebaseUser = decoded ? await getFirebaseUser(firebaseUid).catch(() => null) : null;
      const displayName = username || firebaseUser?.displayName || null;
      const photoURL = firebaseUser?.photoURL || null;

      const userResult = await client.query(
        `INSERT INTO users (firebase_uid, phone, role, preferred_language, status, phone_verified, username, name, created_at, updated_at, last_login_at)
         VALUES ($1, $2, $3, $4, 'active', true, $5, $5, NOW(), NOW(), NOW())
         RETURNING id`,
        [firebaseUid, phone, role, language, displayName]
      );
      const userId = userResult.rows[0].id;

      let driverProfileId: string | undefined;
      let passengerProfileId: string | undefined;

      if (role === 'driver') {
        const driverResult = await client.query(
          `INSERT INTO driver_profiles (user_id, full_name, profile_photo_url)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [userId, displayName || 'JustGO Driver', photoURL]
        );
        driverProfileId = driverResult.rows[0].id;
      } else {
        const passengerResult = await client.query(
          `INSERT INTO passenger_profiles (user_id, full_name, profile_photo_url)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [userId, displayName || 'JustGO Passenger', photoURL]
        );
        passengerProfileId = passengerResult.rows[0].id;
      }

      const token = jwt.sign(
        { userId, phone, role },
        config.jwtSecret,
        { expiresIn: '30d' }
      );

      logger.info('New user registered via verifyAndRegister', { userId, role });

      return {
        userId,
        phone,
        username: displayName || undefined,
        role,
        isNewUser: !displayName,
        driverProfileId,
        passengerProfileId,
        token,
      };
    });
  }

  /** Refresh session */
  async refreshSession(idToken: string): Promise<{ userId: string; role: UserRole }> {
    try {
      const decodedJwt = jwt.verify(idToken, config.jwtSecret) as { userId?: string };
      if (decodedJwt.userId) {
        const result = await query('SELECT id, role FROM users WHERE id = $1 AND status = $2', [decodedJwt.userId, 'active']);
        if (result.rows.length > 0) {
          return { userId: result.rows[0].id, role: result.rows[0].role };
        }
      }
    } catch {}

    const decoded = await verifyIdToken(idToken).catch(() => null);
    if (decoded) {
      const result = await query(
        'SELECT id, role FROM users WHERE firebase_uid = $1 AND status = $2',
        [decoded.uid, 'active']
      );
      if (result.rows.length > 0) {
        return { userId: result.rows[0].id, role: result.rows[0].role };
      }
    }

    throw new AppError('User not found or suspended', 401);
  }
}
