import { Router } from 'express';
import { UsersController } from './users.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
const ctrl = new UsersController();

router.use(authenticate);

router.get('/me', ctrl.getMe.bind(ctrl));
router.patch('/me/language', ctrl.updateLanguage.bind(ctrl));
router.delete('/me', ctrl.deleteAccount.bind(ctrl));

export default router;
