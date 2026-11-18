import { Router } from 'express';
import { FinancialsController } from './financials.controller';
import { authenticate } from '../../middleware/auth';
import { requireDriver } from '../../middleware/roleGuard';

const router = Router();
const ctrl = new FinancialsController();
const auth = [authenticate, requireDriver] as const;

router.get('/earnings',        ...auth, (r,s,n) => ctrl.getEarnings(r,s,n));
router.get('/expenses',        ...auth, (r,s,n) => ctrl.listExpenses(r,s,n));
router.post('/expenses',       ...auth, (r,s,n) => ctrl.addExpense(r,s,n));
router.delete('/expenses/:id', ...auth, (r,s,n) => ctrl.deleteExpense(r,s,n));

export default router;
