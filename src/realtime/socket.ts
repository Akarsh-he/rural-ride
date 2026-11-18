// ============================================================
// RuralMobility — Socket.io Real-time Server
// ============================================================

import { Server, Socket } from 'socket.io';
import { verifyIdToken } from '../config/firebase';
import { getRedisClient } from '../config/redis';
import { logger } from '../utils/logger';
import { query } from '../config/database';

interface AuthSocket extends Socket {
  userId?: string;
  role?: string;
  driverProfileId?: string;
  passengerProfileId?: string;
}

export function setupSocket(io: Server): void {
  // ── Auth middleware ─────────────────────────────────────────
  io.use(async (socket: AuthSocket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error('Missing auth token'));

      const decoded = await verifyIdToken(token);
      if (!decoded) return next(new Error('Firebase not configured'));
      const result = await query<{
        id: string; role: string;
        driver_profile_id?: string; passenger_profile_id?: string;
      }>(
        `SELECT u.id, u.role, dp.id AS driver_profile_id, pp.id AS passenger_profile_id
         FROM users u
         LEFT JOIN driver_profiles dp ON dp.user_id = u.id
         LEFT JOIN passenger_profiles pp ON pp.user_id = u.id
         WHERE u.firebase_uid = $1 AND u.status = 'active'`,
        [decoded.uid]
      );

      if (!result.rows.length) return next(new Error('User not found'));
      const user = result.rows[0];

      socket.userId = user.id;
      socket.role = user.role;
      socket.driverProfileId = user.driver_profile_id;
      socket.passengerProfileId = user.passenger_profile_id;
      next();
    } catch {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (rawSocket: Socket) => {
    const socket = rawSocket as AuthSocket;
    logger.info('Socket connected', { userId: socket.userId, role: socket.role });

    // ── Join personal room ────────────────────────────────────
    if (socket.userId) socket.join(`user:${socket.userId}`);
    if (socket.role === 'driver' && socket.driverProfileId) {
      socket.join(`driver:${socket.driverProfileId}`);
    }
    if (socket.role === 'passenger' && socket.passengerProfileId) {
      socket.join(`passenger:${socket.passengerProfileId}`);
    }
    if (socket.role === 'admin' || socket.role === 'support') {
      socket.join('admin');
    }

    // ── Driver: location update ───────────────────────────────
    socket.on('driver:location', async (data: { lat: number; lng: number; journeyId?: string }) => {
      if (socket.role !== 'driver' || !socket.driverProfileId) return;
      try {
        const redis = getRedisClient();
        const locationKey = `driver:location:${socket.driverProfileId}`;
        await redis.set(locationKey, JSON.stringify({ lat: data.lat, lng: data.lng, ts: Date.now() }), { EX: 60 });

        // Update DB
        await query(
          `UPDATE driver_profiles SET current_location = ST_SetSRID(ST_MakePoint($1,$2),4326), location_updated_at = NOW() WHERE id = $3`,
          [data.lng, data.lat, socket.driverProfileId]
        );

        // Broadcast to journey room if on active journey
        if (data.journeyId) {
          io.to(`journey:${data.journeyId}`).emit('driver:location:update', {
            driverProfileId: socket.driverProfileId,
            lat: data.lat, lng: data.lng, ts: Date.now(),
          });
        }
      } catch (err) {
        logger.error('Socket driver:location error', { error: (err as Error).message });
      }
    });

    // ── Driver: go online/offline ─────────────────────────────
    socket.on('driver:status', async (data: { isOnline: boolean }) => {
      if (socket.role !== 'driver' || !socket.driverProfileId) return;
      try {
        await query('UPDATE driver_profiles SET is_online = $1 WHERE id = $2', [data.isOnline, socket.driverProfileId]);
        io.to('admin').emit('driver:status:update', { driverProfileId: socket.driverProfileId, isOnline: data.isOnline });
      } catch (err) {
        logger.error('Socket driver:status error', { error: (err as Error).message });
      }
    });

    // ── Driver: accept/reject booking ─────────────────────────
    socket.on('booking:respond', async (data: { bookingRequestId: string; accepted: boolean }) => {
      if (socket.role !== 'driver') return;
      try {
        const result = await query<{ passenger_id: string }>(
          'SELECT passenger_id FROM booking_requests WHERE id = $1',
          [data.bookingRequestId]
        );
        if (!result.rows.length) return;

        const passengerId = result.rows[0].passenger_id;
        const event = data.accepted ? 'booking:accepted' : 'booking:rejected';
        io.to(`passenger:${passengerId}`).emit(event, { bookingRequestId: data.bookingRequestId });
      } catch (err) {
        logger.error('Socket booking:respond error', { error: (err as Error).message });
      }
    });

    // ── Passenger: join journey room ──────────────────────────
    socket.on('journey:join', (data: { journeyId: string }) => {
      socket.join(`journey:${data.journeyId}`);
      logger.debug('Passenger joined journey room', { journeyId: data.journeyId });
    });

    // ── SOS ───────────────────────────────────────────────────
    socket.on('sos:trigger', async (data: { lat: number; lng: number; bookingId?: string }) => {
      logger.warn('🚨 SOS triggered', { userId: socket.userId, ...data });
      io.to('admin').emit('sos:alert', {
        userId: socket.userId, role: socket.role,
        lat: data.lat, lng: data.lng, bookingId: data.bookingId, ts: Date.now(),
      });
      socket.emit('sos:received', { message: 'SOS received. Help is on the way.' });
    });

    // ── Journey: status update ────────────────────────────────
    socket.on('journey:status', (data: { journeyId: string; status: string }) => {
      io.to(`journey:${data.journeyId}`).emit('journey:status:update', data);
    });

    // ── Disconnect ────────────────────────────────────────────
    socket.on('disconnect', async () => {
      logger.info('Socket disconnected', { userId: socket.userId });
      if (socket.role === 'driver' && socket.driverProfileId) {
        try {
          await query('UPDATE driver_profiles SET is_online = false WHERE id = $1', [socket.driverProfileId]);
        } catch { /* ignore */ }
      }
    });
  });
}

export function emitToUser(targetOrIo: any, userIdOrEvent: string, eventOrData: any, maybeData?: any): void {
  const io = typeof targetOrIo === 'string' ? ioInstance : targetOrIo;
  const userId = typeof targetOrIo === 'string' ? targetOrIo : userIdOrEvent;
  const event = typeof targetOrIo === 'string' ? userIdOrEvent : eventOrData;
  const data = typeof targetOrIo === 'string' ? eventOrData : maybeData;
  if (io) io.to(`user:${userId}`).emit(event, data);
}

export function emitToDriver(targetOrIo: any, driverIdOrEvent: string, eventOrData: any, maybeData?: any): void {
  const io = typeof targetOrIo === 'string' ? ioInstance : targetOrIo;
  const driverId = typeof targetOrIo === 'string' ? targetOrIo : driverIdOrEvent;
  const event = typeof targetOrIo === 'string' ? driverIdOrEvent : eventOrData;
  const data = typeof targetOrIo === 'string' ? eventOrData : maybeData;
  if (io) io.to(`driver:${driverId}`).emit(event, data);
}

export function emitToPassenger(targetOrIo: any, passengerIdOrEvent: string, eventOrData: any, maybeData?: any): void {
  const io = typeof targetOrIo === 'string' ? ioInstance : targetOrIo;
  const passengerId = typeof targetOrIo === 'string' ? targetOrIo : passengerIdOrEvent;
  const event = typeof targetOrIo === 'string' ? passengerIdOrEvent : eventOrData;
  const data = typeof targetOrIo === 'string' ? eventOrData : maybeData;
  if (io) io.to(`passenger:${passengerId}`).emit(event, data);
}

let ioInstance: Server | null = null;

export function initSocketServer(httpServer: import('http').Server): Server {
  ioInstance = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });
  setupSocket(ioInstance);
  return ioInstance;
}

export function getIO(): Server {
  if (!ioInstance) throw new Error('Socket.io not initialized');
  return ioInstance;
}

export function emitToJourney(journeyId: string, event: string, data: unknown): void {
  if (ioInstance) {
    ioInstance.to(`journey:${journeyId}`).emit(event, data);
  }
}
