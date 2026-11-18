// ============================================================
// Drivers Controller
// ============================================================
import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { DriversService } from './drivers.service';
import { sendSuccess, sendCreated, sendValidationError } from '../../utils/response';

const svc = new DriversService();

const profileSchema = Joi.object({
  fullName: Joi.string().optional(),
  dateOfBirth: Joi.string().isoDate().optional(),
  address: Joi.string().optional(),
  profilePhotoUrl: Joi.string().uri().optional(),
});

const vehicleSchema = Joi.object({
  vehicleType: Joi.string().valid('auto_rickshaw','e_rickshaw','bike','private_car','tempo').required(),
  registrationNumber: Joi.string().required(),
  make: Joi.string().optional(),
  model: Joi.string().optional(),
  year: Joi.number().optional(),
  color: Joi.string().optional(),
  maxPassengers: Joi.number().integer().min(1).max(10).required(),
  fuelType: Joi.string().optional(),
});

const locationSchema = Joi.object({
  lat: Joi.number().required(),
  lng: Joi.number().required(),
});

export class DriversController {
  async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const profile = await svc.getProfile(req.user!.driverProfileId!);
      sendSuccess(res, profile);
    } catch (err) { next(err); }
  }

  async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const { error, value } = profileSchema.validate(req.body);
      if (error) return sendValidationError(res, error.message);
      const profile = await svc.updateProfile(req.user!.driverProfileId!, value);
      sendSuccess(res, profile, 'Profile updated');
    } catch (err) { next(err); }
  }

  async addVehicle(req: Request, res: Response, next: NextFunction) {
    try {
      const { error, value } = vehicleSchema.validate(req.body);
      if (error) return sendValidationError(res, error.message);
      const vehicle = await svc.addVehicle(req.user!.driverProfileId!, value);
      sendCreated(res, vehicle, 'Vehicle added');
    } catch (err) { next(err); }
  }

  async getDashboard(req: Request, res: Response, next: NextFunction) {
    try {
      const dashboard = await svc.getDashboard(req.user!.driverProfileId!);
      sendSuccess(res, dashboard);
    } catch (err) { next(err); }
  }

  async setOnlineStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { isOnline } = req.body;
      if (isOnline === undefined) return sendValidationError(res, 'isOnline required');
      await svc.setOnlineStatus(req.user!.driverProfileId!, isOnline);
      sendSuccess(res, null, `You are now ${isOnline ? 'online' : 'offline'}`);
    } catch (err) { next(err); }
  }

  async updateLocation(req: Request, res: Response, next: NextFunction) {
    try {
      const { error, value } = locationSchema.validate(req.body);
      if (error) return sendValidationError(res, error.message);
      await svc.updateLocation(req.user!.driverProfileId!, value);
      sendSuccess(res, null, 'Location updated');
    } catch (err) { next(err); }
  }

  async uploadDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const { docType, url } = req.body;
      if (!docType || !url) return sendValidationError(res, 'docType and url required');
      const doc = await svc.uploadDocument(req.user!.driverProfileId!, docType, url);
      sendCreated(res, doc, 'Document submitted for review');
    } catch (err) { next(err); }
  }

  async getDocuments(req: Request, res: Response, next: NextFunction) {
    try {
      const docs = await svc.getDocuments(req.user!.driverProfileId!);
      sendSuccess(res, docs);
    } catch (err) { next(err); }
  }
}
