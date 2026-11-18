import * as admin from 'firebase-admin';
import { getFirebaseApp } from '../../config/firebase';
import { query } from '../../config/database';
import { NotFoundError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';

interface FCMPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export class NotificationsService {
  private async getFcmToken(userId: string): Promise<string | null> {
    const result = await query<{ fcm_token: string | null }>(
      'SELECT fcm_token FROM users WHERE id = $1',
      [userId]
    );
    return result.rows[0]?.fcm_token ?? null;
  }

  async sendToUser(userId: string, payload: FCMPayload): Promise<void> {
    const token = await this.getFcmToken(userId);
    if (!token) return;

    try {
      const app = getFirebaseApp();
      if (!app) {
        logger.warn('FCM skipped — Firebase not configured', { userId });
      } else {
        await app.messaging().send({
          token,
          notification: { title: payload.title, body: payload.body },
          data: payload.data,
          android: { priority: 'high' },
          apns: { payload: { aps: { sound: 'default' } } },
        });
      }
    } catch (err) {
      logger.warn('FCM send failed', { userId, error: (err as Error).message });
    }

    // Store notification in DB
    await query(
      `INSERT INTO notifications (user_id, title, body, data) VALUES ($1, $2, $3, $4)`,
      [userId, payload.title, payload.body, JSON.stringify(payload.data ?? {})]
    );
  }

  async sendBookingRequest(driverUserId: string, details: {
    bookingRequestId: string;
    passengerName: string;
    pickupName: string;
    dropoffName: string;
    fare: number;
  }): Promise<void> {
    await this.sendToUser(driverUserId, {
      title: 'New Booking Request',
      body: `${details.passengerName} wants to ride from ${details.pickupName} to ${details.dropoffName} (₹${details.fare})`,
      data: {
        type: 'booking_request',
        bookingRequestId: details.bookingRequestId,
      },
    });
  }

  async sendBookingResponse(passengerUserId: string, details: {
    bookingRequestId: string;
    accepted: boolean;
    driverName?: string;
  }): Promise<void> {
    await this.sendToUser(passengerUserId, {
      title: details.accepted ? 'Booking Accepted!' : 'Booking Rejected',
      body: details.accepted
        ? `${details.driverName ?? 'Driver'} accepted your booking.`
        : 'Your booking request was rejected. Please try another journey.',
      data: {
        type: 'booking_response',
        bookingRequestId: details.bookingRequestId,
        accepted: String(details.accepted),
      },
    });
  }

  async sendJourneyUpdate(passengerUserId: string, details: {
    journeyId: string;
    status: string;
    message: string;
  }): Promise<void> {
    await this.sendToUser(passengerUserId, {
      title: 'Journey Update',
      body: details.message,
      data: {
        type: 'journey_update',
        journeyId: details.journeyId,
        status: details.status,
      },
    });
  }

  async sendSOSAlert(adminUserIds: string[], details: {
    userId: string;
    role: string;
    lat?: number;
    lng?: number;
    message?: string;
  }): Promise<void> {
    await Promise.all(
      adminUserIds.map((adminId) =>
        this.sendToUser(adminId, {
          title: '🚨 SOS Alert',
          body: details.message ?? `SOS from ${details.role} ${details.userId}`,
          data: {
            type: 'sos',
            userId: details.userId,
            role: details.role,
            lat: String(details.lat ?? ''),
            lng: String(details.lng ?? ''),
          },
        })
      )
    );
  }

  async markRead(notificationId: string, userId: string): Promise<void> {
    await query(
      `UPDATE notifications SET read = true, updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [notificationId, userId]
    );
  }

  async getUnread(userId: string): Promise<unknown[]> {
    const result = await query(
      `SELECT id, title, body, data, created_at FROM notifications
       WHERE user_id = $1 AND read = false
       ORDER BY created_at DESC LIMIT 50`,
      [userId]
    );
    return result.rows;
  }

  async markAllRead(userId: string): Promise<void> {
    await query(
      `UPDATE notifications SET read = true, updated_at = NOW() WHERE user_id = $1 AND read = false`,
      [userId]
    );
  }
}
