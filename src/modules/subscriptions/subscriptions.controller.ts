import { Request, Response, NextFunction } from 'express';
import { SubscriptionsService } from './subscriptions.service';
import { sendSuccess, sendValidationError } from '../../utils/response';

const svc = new SubscriptionsService();

export class SubscriptionsController {
  async listPlans(req: Request, res: Response, next: NextFunction) {
    try { sendSuccess(res, await svc.listPlans()); } catch (err) { next(err); }
  }
  async getCurrent(req: Request, res: Response, next: NextFunction) {
    try { sendSuccess(res, await svc.getCurrentPlan(req.user!.driverProfileId!)); } catch (err) { next(err); }
  }
  async subscribe(req: Request, res: Response, next: NextFunction) {
    try {
      const { plan } = req.body;
      if (!plan) return sendValidationError(res, 'plan required');
      sendSuccess(res, await svc.upgradePlan(req.user!.driverProfileId!, plan), 'Subscription activated');
    } catch (err) { next(err); }
  }
  async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      await svc.cancelSubscription(req.user!.driverProfileId!);
      sendSuccess(res, null, 'Subscription cancelled');
    } catch (err) { next(err); }
  }
}
