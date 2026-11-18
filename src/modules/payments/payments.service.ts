import crypto from 'crypto';
import Razorpay from 'razorpay';
import { query, withTransaction } from '../../config/database';
import { NotFoundError, AppError, ValidationError } from '../../middleware/errorHandler';
import { config } from '../../config/env';
import { PaymentRow, ConfirmedBookingRow } from '../../types';

function getRazorpay(): Razorpay {
  return new Razorpay({
    key_id: config.razorpay.keyId,
    key_secret: config.razorpay.keySecret,
  });
}

export class PaymentsService {
  async createRazorpayOrder(data: {
    bookingId: string;
    passengerProfileId: string;
  }): Promise<{ orderId: string; amount: number; currency: string }> {
    const bookingResult = await query<ConfirmedBookingRow>(
      `SELECT * FROM confirmed_bookings WHERE id = $1 AND passenger_id = $2 AND payment_status = 'pending'`,
      [data.bookingId, data.passengerProfileId]
    );

    if (bookingResult.rows.length === 0) throw new NotFoundError('Booking');
    const booking = bookingResult.rows[0];

    const amountPaise = Math.round(parseFloat(booking.confirmed_fare) * 100);

    const razorpay = getRazorpay();
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `booking_${booking.id}`,
    });

    // Store order id on booking
    await query(
      `UPDATE confirmed_bookings SET razorpay_order_id = $1, updated_at = NOW() WHERE id = $2`,
      [order.id, booking.id]
    );

    return { orderId: order.id as string, amount: amountPaise, currency: 'INR' };
  }

  async verifyPayment(data: {
    bookingId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }): Promise<PaymentRow> {
    // Verify signature
    const expectedSig = crypto
      .createHmac('sha256', config.razorpay.keySecret)
      .update(`${data.razorpayOrderId}|${data.razorpayPaymentId}`)
      .digest('hex');

    if (expectedSig !== data.razorpaySignature) {
      throw new ValidationError('Invalid payment signature');
    }

    return withTransaction(async (client) => {
      const bookingResult = await client.query<ConfirmedBookingRow>(
        `SELECT * FROM confirmed_bookings WHERE id = $1 AND razorpay_order_id = $2 FOR UPDATE`,
        [data.bookingId, data.razorpayOrderId]
      );
      if (bookingResult.rows.length === 0) throw new NotFoundError('Booking');

      const booking = bookingResult.rows[0];
      const fare = parseFloat(booking.confirmed_fare);
      const commission = (fare * config.business.platformCommissionPct) / 100;
      const driverEarning = fare - commission;

      // Update booking
      await client.query(
        `UPDATE confirmed_bookings
         SET razorpay_payment_id = $1, razorpay_order_id = $2,
             payment_status = 'paid', updated_at = NOW()
         WHERE id = $3`,
        [data.razorpayPaymentId, data.razorpayOrderId, booking.id]
      );

      // Insert / update payment record
      const payResult = await client.query<PaymentRow>(
        `INSERT INTO payments (
           booking_id, passenger_id, driver_id, amount,
           platform_commission, driver_earning, payment_method, status,
           razorpay_order_id, razorpay_payment_id, razorpay_signature, processed_at
         ) VALUES ($1, $2, $3, $4, $5, $6, 'razorpay', 'paid', $7, $8, $9, NOW())
         ON CONFLICT (booking_id) DO UPDATE
           SET status = 'paid', razorpay_payment_id = $8,
               razorpay_signature = $9, processed_at = NOW()
         RETURNING *`,
        [
          booking.id,
          booking.passenger_id,
          booking.driver_id,
          fare,
          commission,
          driverEarning,
          data.razorpayOrderId,
          data.razorpayPaymentId,
          data.razorpaySignature,
        ]
      );

      return payResult.rows[0];
    });
  }

  async recordCashPayment(data: {
    bookingId: string;
    driverProfileId: string;
  }): Promise<PaymentRow> {
    return withTransaction(async (client) => {
      const bookingResult = await client.query<ConfirmedBookingRow>(
        `SELECT * FROM confirmed_bookings
         WHERE id = $1 AND driver_id = $2 AND payment_method = 'cash'
           AND payment_status = 'pending' FOR UPDATE`,
        [data.bookingId, data.driverProfileId]
      );
      if (bookingResult.rows.length === 0) throw new NotFoundError('Booking');

      const booking = bookingResult.rows[0];
      const fare = parseFloat(booking.confirmed_fare);
      const commission = (fare * config.business.platformCommissionPct) / 100;
      const driverEarning = fare - commission;

      await client.query(
        `UPDATE confirmed_bookings SET payment_status = 'paid', updated_at = NOW() WHERE id = $1`,
        [booking.id]
      );

      const payResult = await client.query<PaymentRow>(
        `INSERT INTO payments (
           booking_id, passenger_id, driver_id, amount,
           platform_commission, driver_earning, payment_method, status, processed_at
         ) VALUES ($1, $2, $3, $4, $5, $6, 'cash', 'paid', NOW())
         RETURNING *`,
        [
          booking.id,
          booking.passenger_id,
          booking.driver_id,
          fare,
          commission,
          driverEarning,
        ]
      );
      return payResult.rows[0];
    });
  }

  async getPaymentHistory(
    userId: string,
    page: number,
    limit: number
  ): Promise<{ payments: PaymentRow[]; total: number }> {
    const offset = (page - 1) * limit;
    const [rows, count] = await Promise.all([
      query<PaymentRow>(
        `SELECT p.* FROM payments p
         JOIN confirmed_bookings cb ON cb.id = p.booking_id
         JOIN passenger_profiles pp ON pp.id = cb.passenger_id
         WHERE pp.user_id = $1
         ORDER BY p.created_at DESC LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM payments p
         JOIN confirmed_bookings cb ON cb.id = p.booking_id
         JOIN passenger_profiles pp ON pp.id = cb.passenger_id
         WHERE pp.user_id = $1`,
        [userId]
      ),
    ]);
    return { payments: rows.rows, total: parseInt(count.rows[0].count, 10) };
  }

  async processDriverPayout(driverProfileId: string): Promise<{ amount: number }> {
    // Aggregate unpaid driver earnings and mark as payout_requested
    const result = await query<{ total: string }>(
      `SELECT COALESCE(SUM(driver_earning), 0) AS total
       FROM payments
       WHERE driver_id = $1 AND status = 'paid'`,
      [driverProfileId]
    );
    // In a real system this would call a payout API (Razorpay X, etc.)
    return { amount: parseFloat(result.rows[0].total) };
  }
}
