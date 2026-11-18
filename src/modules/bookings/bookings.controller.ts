// ============================================================
// Bookings Controller
// ============================================================
import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { BookingsService } from './bookings.service';
import { sendSuccess, sendCreated, sendValidationError } from '../../utils/response';

const svc = new BookingsService();

const requestSchema = Joi.object({
  journeyId: Joi.string().uuid().required(),
  seatsRequested: Joi.number().integer().min(1).max(6).default(1),
  pickupName: Joi.string().required(),
  pickupLat: Joi.number().required(),
  pickupLng: Joi.number().required(),
  dropoffName: Joi.string().required(),
  dropoffLat: Joi.number().required(),
  dropoffLng: Joi.number().required(),
  paymentMethod: Joi.string().valid('cash', 'upi', 'razorpay').required(),
  passengerNotes: Joi.string().optional().allow(''),
});

const reviewSchema = Joi.object({
  rating: Joi.number().min(1).max(5).required(),
  comment: Joi.string().optional().allow(''),
});

export class BookingsController {
  async request(req: Request, res: Response, next: NextFunction) {
    try {
      const { error, value } = requestSchema.validate(req.body);
      if (error) return sendValidationError(res, error.message);
      const booking = await svc.requestBooking({ ...value, passengerProfileId: req.user!.passengerProfileId! });
      sendCreated(res, booking, 'Booking request sent');
    } catch (err) { next(err); }
  }

  async respond(req: Request, res: Response, next: NextFunction) {
    try {
      const { accepted } = req.body;
      if (accepted === undefined) return sendValidationError(res, 'accepted required');
      const result = await svc.respondToBooking({
        bookingRequestId: req.params.id,
        driverProfileId: req.user!.driverProfileId!,
        accepted,
      });
      sendSuccess(res, result, accepted ? 'Booking accepted' : 'Booking rejected');
    } catch (err) { next(err); }
  }

  async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      await svc.cancelBooking(req.params.id, req.user!.userId);
      sendSuccess(res, null, 'Booking cancelled');
    } catch (err) { next(err); }
  }

  async getPassengerBookings(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const bookings = await svc.getPassengerBookings(req.user!.passengerProfileId!, page, limit);
      sendSuccess(res, bookings);
    } catch (err) { next(err); }
  }

  async getDriverPending(req: Request, res: Response, next: NextFunction) {
    try {
      const bookings = await svc.getDriverPendingBookings(req.user!.driverProfileId!);
      sendSuccess(res, bookings);
    } catch (err) { next(err); }
  }

  async markPickedUp(req: Request, res: Response, next: NextFunction) {
    try {
      await svc.markPickedUp(req.params.id, req.user!.driverProfileId!);
      sendSuccess(res, null, 'Marked as picked up');
    } catch (err) { next(err); }
  }

  async complete(req: Request, res: Response, next: NextFunction) {
    try {
      await svc.completeBooking(req.params.id, req.user!.driverProfileId!);
      sendSuccess(res, null, 'Booking completed');
    } catch (err) { next(err); }
  }

  async submitReview(req: Request, res: Response, next: NextFunction) {
    try {
      const { error, value } = reviewSchema.validate(req.body);
      if (error) return sendValidationError(res, error.message);
      await svc.submitReview({
        bookingId: req.params.id,
        passengerProfileId: req.user!.passengerProfileId!,
        rating: value.rating,
        comment: value.comment,
      });
      sendSuccess(res, null, 'Review submitted');
    } catch (err) { next(err); }
  }
}
