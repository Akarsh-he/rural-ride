// ============================================================
// Journeys Controller
// ============================================================
import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { JourneysService } from './journeys.service';
import { sendSuccess, sendCreated, sendValidationError } from '../../utils/response';

const svc = new JourneysService();

const createSchema = Joi.object({
  vehicleId: Joi.string().uuid().required(),
  originName: Joi.string().required(),
  originLat: Joi.number().required(),
  originLng: Joi.number().required(),
  destinationName: Joi.string().required(),
  destinationLat: Joi.number().required(),
  destinationLng: Joi.number().required(),
  departureTime: Joi.string().isoDate().required(),
  totalSeats: Joi.number().integer().min(1).max(10).required(),
  baseFarePerKm: Joi.number().min(0).required(),
  minimumFare: Joi.number().min(0).required(),
  journeyType: Joi.string().valid('shared', 'private').default('shared'),
  notes: Joi.string().optional().allow(''),
  waypoints: Joi.array().optional(),
});

const searchSchema = Joi.object({
  pickupLat: Joi.number().required(),
  pickupLng: Joi.number().required(),
  destinationLat: Joi.number().required(),
  destinationLng: Joi.number().required(),
  seatsNeeded: Joi.number().integer().min(1).default(1),
  maxDeviationMeters: Joi.number().default(500),
  vehicleTypes: Joi.array().items(Joi.string()).optional(),
  maxResults: Joi.number().default(10),
});

export class JourneysController {
  async search(req: Request, res: Response, next: NextFunction) {
    try {
      const { error, value } = searchSchema.validate(req.query);
      if (error) return sendValidationError(res, error.message);
      const results = await svc.searchJourneys(value);
      sendSuccess(res, results);
    } catch (err) { next(err); }
  }

  async getNearby(req: Request, res: Response, next: NextFunction) {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lng = parseFloat(req.query.lng as string);
      if (isNaN(lat) || isNaN(lng)) return sendValidationError(res, 'lat and lng required');
      const results = await svc.searchNearbyJourneys(lat, lng);
      sendSuccess(res, results);
    } catch (err) { next(err); }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { error, value } = createSchema.validate(req.body);
      if (error) return sendValidationError(res, error.message);
      const journey = await svc.createJourney(req.user!.driverProfileId!, value);
      sendCreated(res, journey, 'Journey created');
    } catch (err) { next(err); }
  }

  async getOne(req: Request, res: Response, next: NextFunction) {
    try {
      const journey = await svc.getJourney(req.params.id);
      sendSuccess(res, journey);
    } catch (err) { next(err); }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { status } = req.body;
      if (!status) return sendValidationError(res, 'status required');
      const journey = await svc.updateJourneyStatus(req.params.id, req.user!.driverProfileId!, status);
      sendSuccess(res, journey, 'Status updated');
    } catch (err) { next(err); }
  }

  async getDriverActive(req: Request, res: Response, next: NextFunction) {
    try {
      const journey = await svc.getDriverActiveJourney(req.user!.driverProfileId!);
      sendSuccess(res, journey);
    } catch (err) { next(err); }
  }

  async getDriverHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const journeys = await svc.listDriverJourneys(req.user!.driverProfileId!, page, limit);
      sendSuccess(res, journeys);
    } catch (err) { next(err); }
  }
}
