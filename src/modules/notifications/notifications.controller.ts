import { Request, Response, NextFunction } from 'express';
import { NotificationsService } from './notifications.service';
import { sendSuccess } from '../../utils/response';

const svc = new NotificationsService();

export class NotificationsController {
  async getUnread(req: Request, res: Response, next: NextFunction) {
    try { sendSuccess(res, await svc.getUnread(req.user!.userId)); } catch (err) { next(err); }
  }
  async markRead(req: Request, res: Response, next: NextFunction) {
    try { await svc.markRead(req.params.id, req.user!.userId); sendSuccess(res, null, 'Marked read'); } catch (err) { next(err); }
  }
  async markAllRead(req: Request, res: Response, next: NextFunction) {
    try { await svc.markAllRead(req.user!.userId); sendSuccess(res, null, 'All marked read'); } catch (err) { next(err); }
  }
}
