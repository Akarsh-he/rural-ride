import { Router } from 'express';
import { JourneysController } from './journeys.controller';
import { authenticate } from '../../middleware/auth';
import { requireDriver, requireAnyRole } from '../../middleware/roleGuard';

const router = Router();
const ctrl = new JourneysController();

// Public / any-auth
router.get('/search',         authenticate, requireAnyRole, (r, s, n) => ctrl.search(r, s, n));
router.get('/nearby',         authenticate, requireAnyRole, (r, s, n) => ctrl.getNearby(r, s, n));

// Driver only
router.post('/',              authenticate, requireDriver,  (r, s, n) => ctrl.create(r, s, n));
router.post('/create',        authenticate, requireDriver,  (r, s, n) => ctrl.create(r, s, n));
router.get('/driver/active',  authenticate, requireDriver,  (r, s, n) => ctrl.getDriverActive(r, s, n));
router.get('/driver/history', authenticate, requireDriver,  (r, s, n) => ctrl.getDriverHistory(r, s, n));
router.patch('/:id/status',   authenticate, requireDriver,  (r, s, n) => ctrl.updateStatus(r, s, n));

// Any authenticated
router.get('/:id',            authenticate, requireAnyRole, (r, s, n) => ctrl.getOne(r, s, n));

export default router;
