import { Router } from 'express';
import { SubscriptionsController } from './subscriptions.controller';
import { authenticate } from '../../middleware/auth';
import { requireDriver } from '../../middleware/roleGuard';

const router = Router();
const ctrl = new SubscriptionsController();

router.get('/plans',    (r,s,n) => ctrl.listPlans(r,s,n));
router.get('/current',  authenticate, requireDriver, (r,s,n) => ctrl.getCurrent(r,s,n));
router.post('/subscribe', authenticate, requireDriver, (r,s,n) => ctrl.subscribe(r,s,n));
router.delete('/cancel',  authenticate, requireDriver, (r,s,n) => ctrl.cancel(r,s,n));

export default router;
