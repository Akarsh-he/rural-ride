import { Router } from 'express';
import { PaymentsController } from './payments.controller';
import { authenticate } from '../../middleware/auth';
import { requirePassenger, requireDriver, requireAnyRole } from '../../middleware/roleGuard';

const router = Router();
const ctrl = new PaymentsController();

router.post('/create-order', authenticate, requirePassenger, (r,s,n) => ctrl.createOrder(r,s,n));
router.post('/verify',       authenticate, requirePassenger, (r,s,n) => ctrl.verify(r,s,n));
router.post('/cash-confirm', authenticate, requireDriver,    (r,s,n) => ctrl.cashConfirm(r,s,n));
router.get('/history',       authenticate, requireAnyRole,   (r,s,n) => ctrl.getHistory(r,s,n));

export default router;
