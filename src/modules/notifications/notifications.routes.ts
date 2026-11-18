import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireAnyRole } from '../../middleware/roleGuard';
import { NotificationsController } from './notifications.controller';

const router = Router();
const ctrl = new NotificationsController();

router.get('/',           authenticate, requireAnyRole, (r,s,n) => ctrl.getUnread(r,s,n));
router.patch('/:id/read', authenticate, requireAnyRole, (r,s,n) => ctrl.markRead(r,s,n));
router.patch('/read-all', authenticate, requireAnyRole, (r,s,n) => ctrl.markAllRead(r,s,n));

export default router;
