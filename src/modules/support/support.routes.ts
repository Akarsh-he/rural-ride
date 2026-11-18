import { Router } from 'express';
import { SupportController } from './support.controller';
import { authenticate } from '../../middleware/auth';
import { requireAnyRole, requireSupport } from '../../middleware/roleGuard';

const router = Router();
const ctrl = new SupportController();

router.post('/',               authenticate, requireAnyRole, (r,s,n) => ctrl.create(r,s,n));
router.get('/',                authenticate, requireAnyRole, (r,s,n) => ctrl.list(r,s,n));
router.get('/:id',             authenticate, requireAnyRole, (r,s,n) => ctrl.getOne(r,s,n));
router.post('/:id/messages',   authenticate, requireAnyRole, (r,s,n) => ctrl.addMessage(r,s,n));
router.patch('/:id/close',     authenticate, requireSupport, (r,s,n) => ctrl.close(r,s,n));

export default router;
