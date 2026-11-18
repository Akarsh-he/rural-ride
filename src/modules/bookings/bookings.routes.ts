import { Router } from 'express';
import { BookingsController } from './bookings.controller';
import { authenticate } from '../../middleware/auth';
import { requirePassenger, requireDriver, requireAnyRole } from '../../middleware/roleGuard';

const router = Router();
const ctrl = new BookingsController();

router.post('/request',          authenticate, requirePassenger, (r,s,n) => ctrl.request(r,s,n));
router.get('/passenger',         authenticate, requirePassenger, (r,s,n) => ctrl.getPassengerBookings(r,s,n));
router.get('/driver/pending',    authenticate, requireDriver,    (r,s,n) => ctrl.getDriverPending(r,s,n));
router.post('/:id/respond',      authenticate, requireDriver,    (r,s,n) => ctrl.respond(r,s,n));
router.patch('/:id/picked-up',   authenticate, requireDriver,    (r,s,n) => ctrl.markPickedUp(r,s,n));
router.patch('/:id/complete',    authenticate, requireDriver,    (r,s,n) => ctrl.complete(r,s,n));
router.post('/:id/review',       authenticate, requirePassenger, (r,s,n) => ctrl.submitReview(r,s,n));
router.delete('/:id',            authenticate, requireAnyRole,   (r,s,n) => ctrl.cancel(r,s,n));

export default router;
