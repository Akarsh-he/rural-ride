// ============================================================
// Passengers Controller + Routes
// ============================================================
import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { PassengersService } from './passengers.service';
import { sendSuccess, sendValidationError } from '../../utils/response';

const svc = new PassengersService();

const profileSchema = Joi.object({
  fullName: Joi.string().optional(),
  profilePhotoUrl: Joi.string().uri().optional().allow(''),
  homeAddress: Joi.string().optional().allow(''),
  homeLat: Joi.number().optional(),
  homeLng: Joi.number().optional(),
});

const emergencySchema = Joi.object({
  name: Joi.string().required(),
  phone: Joi.string().pattern(/^\+?[0-9]{10,13}$/).required(),
});

export class PassengersController {
  async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      sendSuccess(res, await svc.getProfile(req.user!.passengerProfileId!));
    } catch (err) { next(err); }
  }

  async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const { error, value } = profileSchema.validate(req.body);
      if (error) return sendValidationError(res, error.message);
      sendSuccess(res, await svc.updateProfile(req.user!.passengerProfileId!, value), 'Profile updated');
    } catch (err) { next(err); }
  }

  async addEmergency(req: Request, res: Response, next: NextFunction) {
    try {
      const { error, value } = emergencySchema.validate(req.body);
      if (error) return sendValidationError(res, error.message);
      sendSuccess(res, await svc.addEmergencyContact(req.user!.passengerProfileId!, value));
    } catch (err) { next(err); }
  }

  async removeEmergency(req: Request, res: Response, next: NextFunction) {
    try {
      await svc.removeEmergencyContact(req.user!.passengerProfileId!, req.params.contactId);
      sendSuccess(res, null, 'Contact removed');
    } catch (err) { next(err); }
  }

  async getRideHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      sendSuccess(res, await svc.getRideHistory(req.user!.passengerProfileId!, page, limit));
    } catch (err) { next(err); }
  }
}
