import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { verifyIdToken } from '../config/firebase';
import { query } from '../config/database';
import { config } from '../config/env';
import { sendUnauthorized } from '../utils/response';
import { logger } from '../utils/logger';
import { AuthUser, UserRow } from '../types';

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendUnauthorized(res, 'Missing or invalid Authorization header');
    return;
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    sendUnauthorized(res, 'Bearer token is empty');
    return;
  }

  // 1. First check if it's a signed JWT (used by Admin Dashboard and API clients)
  try {
    const payload = jwt.verify(token, config.jwtSecret) as {
      adminId?: string;
      userId?: string;
      role?: string;
      email?: string;
    };

    if (payload.adminId || payload.role === 'admin' || payload.role === 'super_admin') {
      const adminId = payload.adminId || payload.userId;
      const adminRes = await query<{ id: string; email: string; role: string; is_active: boolean }>(
        'SELECT id, email, role, is_active FROM admin_accounts WHERE id = $1',
        [adminId]
      );

      if (adminRes.rows.length === 0 || !adminRes.rows[0].is_active) {
        sendUnauthorized(res, 'Admin account inactive or not found');
        return;
      }

      req.user = {
        firebaseUid: `admin_${adminRes.rows[0].id}`,
        userId: adminRes.rows[0].id,
        role: 'admin',
      } as AuthUser;

      return next();
    }

    if (payload.userId) {
      const userRes = await query<UserRow & { driver_profile_id?: string; passenger_profile_id?: string }>(
        `SELECT u.id, u.role, u.status, u.firebase_uid,
                dp.id AS driver_profile_id,
                pp.id AS passenger_profile_id
         FROM users u
         LEFT JOIN driver_profiles dp ON dp.user_id = u.id
         LEFT JOIN passenger_profiles pp ON pp.user_id = u.id
         WHERE u.id = $1`,
        [payload.userId]
      );

      if (userRes.rows.length === 0 || userRes.rows[0].status === 'suspended' || userRes.rows[0].status === 'deleted') {
        sendUnauthorized(res, 'User account invalid or suspended');
        return;
      }

      req.user = {
        firebaseUid: userRes.rows[0].firebase_uid || `jwt_${userRes.rows[0].id}`,
        userId: userRes.rows[0].id,
        role: userRes.rows[0].role,
        driverProfileId: userRes.rows[0].driver_profile_id ?? undefined,
        passengerProfileId: userRes.rows[0].passenger_profile_id ?? undefined,
      } as AuthUser;

      return next();
    }
  } catch (_jwtErr) {
    // Not a valid local JWT, continue to Firebase ID token check
  }

  // 2. Fallback to Firebase ID token verification
  try {
    const decoded = await verifyIdToken(token);

    if (!decoded) {
      sendUnauthorized(res, 'Firebase not configured. Use JWT authentication.');
      return;
    }

    const result = await query<UserRow & { driver_profile_id?: string; passenger_profile_id?: string }>(
      `SELECT u.id, u.role, u.status, u.firebase_uid,
              dp.id AS driver_profile_id,
              pp.id AS passenger_profile_id
       FROM users u
       LEFT JOIN driver_profiles dp ON dp.user_id = u.id
       LEFT JOIN passenger_profiles pp ON pp.user_id = u.id
       WHERE u.firebase_uid = $1`,
      [decoded.uid]
    );

    if (result.rows.length === 0) {
      sendUnauthorized(res, 'User not found. Please complete registration.');
      return;
    }

    const userRow = result.rows[0];

    if (userRow.status === 'suspended') {
      sendUnauthorized(res, 'Your account has been suspended. Please contact support.');
      return;
    }

    if (userRow.status === 'deleted') {
      sendUnauthorized(res, 'Account not found.');
      return;
    }

    req.user = {
      firebaseUid: decoded.uid,
      userId: userRow.id,
      role: userRow.role,
      driverProfileId: userRow.driver_profile_id ?? undefined,
      passengerProfileId: userRow.passenger_profile_id ?? undefined,
    } as AuthUser;

    query('UPDATE users SET last_seen_at = NOW() WHERE id = $1', [userRow.id]).catch(
      (err: Error) => logger.warn('Failed to update last_seen_at', { error: err.message })
    );

    next();
  } catch (err) {
    const error = err as Error & { code?: string };
    logger.warn('Authentication failed', { code: error.code, message: error.message });
    sendUnauthorized(res, 'Authentication failed. Please sign in again.');
  }
}

export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }
  return authenticate(req, res, next);
}
