import { Router } from 'express';
import { DriversController } from './drivers.controller';
import { authenticate } from '../../middleware/auth';
import { requireDriver } from '../../middleware/roleGuard';

const router = Router();
const ctrl = new DriversController();
const auth = [authenticate, requireDriver] as const;

router.get('/profile',    ...auth, (r,s,n) => ctrl.getProfile(r,s,n));
router.put('/profile',    ...auth, (r,s,n) => ctrl.updateProfile(r,s,n));
router.post('/vehicles',  ...auth, (r,s,n) => ctrl.addVehicle(r,s,n));
router.get('/dashboard',  ...auth, (r,s,n) => ctrl.getDashboard(r,s,n));
router.post('/status',    ...auth, (r,s,n) => ctrl.setOnlineStatus(r,s,n));
router.post('/location',  ...auth, (r,s,n) => ctrl.updateLocation(r,s,n));
router.post('/documents', ...auth, (r,s,n) => ctrl.uploadDocument(r,s,n));
router.get('/documents',  ...auth, (r,s,n) => ctrl.getDocuments(r,s,n));

export default router;
