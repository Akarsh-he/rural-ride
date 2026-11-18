// ============================================================
// Payments Controller + Routes
// ============================================================
import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { PaymentsService } from './payments.service';
import { sendSuccess, sendCreated, sendValidationError } from '../../utils/response';

const svc = new PaymentsService();

const orderSchema = Joi.object({ bookingId: Joi.string().uuid().required() });
const verifySchema = Joi.object({
  bookingId: Joi.string().uuid().required(),
  razorpayOrderId: Joi.string().required(),
  razorpayPaymentId: Joi.string().required(),
  razorpaySignature: Joi.string().required(),
});
const cashSchema = Joi.object({ bookingId: Joi.string().uuid().required() });

export class PaymentsController {
  async createOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const { error, value } = orderSchema.validate(req.body);
      if (error) return sendValidationError(res, error.message);
      const order = await svc.createRazorpayOrder({
        bookingId: value.bookingId,
        passengerProfileId: req.user!.passengerProfileId!,
      });
      sendCreated(res, order);
    } catch (err) { next(err); }
  }

  async verify(req: Request, res: Response, next: NextFunction) {
    try {
      const { error, value } = verifySchema.validate(req.body);
      if (error) return sendValidationError(res, error.message);
      const result = await svc.verifyPayment(value);
      sendSuccess(res, result, 'Payment verified');
    } catch (err) { next(err); }
  }

  async cashConfirm(req: Request, res: Response, next: NextFunction) {
    try {
      const { error, value } = cashSchema.validate(req.body);
      if (error) return sendValidationError(res, error.message);
      await svc.recordCashPayment({
        bookingId: value.bookingId,
        driverProfileId: req.user!.driverProfileId!,
      });
      sendSuccess(res, null, 'Cash payment recorded');
    } catch (err) { next(err); }
  }

  async getHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const payments = await svc.getPaymentHistory(req.user!.userId, page, limit);
      sendSuccess(res, payments);
    } catch (err) { next(err); }
  }
}
