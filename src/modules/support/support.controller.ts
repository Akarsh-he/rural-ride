import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { SupportService } from './support.service';
import { sendSuccess, sendCreated, sendValidationError } from '../../utils/response';

const svc = new SupportService();

const createSchema = Joi.object({
  subject: Joi.string().required(),
  description: Joi.string().required(),
  category: Joi.string().valid('payment','booking','driver','technical','other').required(),
  relatedBookingId: Joi.string().uuid().optional(),
});

export class SupportController {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { error, value } = createSchema.validate(req.body);
      if (error) return sendValidationError(res, error.message);
      sendCreated(res, await svc.createTicket(req.user!.userId, value));
    } catch (err) { next(err); }
  }
  async list(req: Request, res: Response, next: NextFunction) {
    try { sendSuccess(res, await svc.getTickets(req.user!.userId, req.user!.role)); } catch (err) { next(err); }
  }
  async getOne(req: Request, res: Response, next: NextFunction) {
    try { sendSuccess(res, await svc.getTicket(req.params.id)); } catch (err) { next(err); }
  }
  async addMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const { message } = req.body;
      if (!message) return sendValidationError(res, 'message required');
      sendCreated(res, await svc.addMessage(req.params.id, req.user!.userId, req.user!.role, message));
    } catch (err) { next(err); }
  }
  async close(req: Request, res: Response, next: NextFunction) {
    try {
      await svc.closeTicket(req.params.id);
      sendSuccess(res, null, 'Ticket closed');
    } catch (err) { next(err); }
  }
}
