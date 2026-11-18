import { Router } from 'express';
import { PassengersController } from './passengers.controller';
import { authenticate } from '../../middleware/auth';
import { requirePassenger } from '../../middleware/roleGuard';

const router = Router();
const ctrl = new PassengersController();
const auth = [authenticate, requirePassenger] as const;

router.get('/profile',                    ...auth, (r,s,n) => ctrl.getProfile(r,s,n));
router.put('/profile',                    ...auth, (r,s,n) => ctrl.updateProfile(r,s,n));
router.post('/emergency-contacts',        ...auth, (r,s,n) => ctrl.addEmergency(r,s,n));
router.delete('/emergency-contacts/:contactId', ...auth, (r,s,n) => ctrl.removeEmergency(r,s,n));
router.get('/rides',                      ...auth, (r,s,n) => ctrl.getRideHistory(r,s,n));

export default router;
