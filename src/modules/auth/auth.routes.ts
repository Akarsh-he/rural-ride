import { Router } from 'express';
import { AuthController } from './auth.controller';
import { authLimiter } from '../../middleware/rateLimiter';

const router = Router();
const ctrl = new AuthController();

router.post('/verify', authLimiter, (req, res, next) => ctrl.verify(req, res, next));
router.post('/refresh', authLimiter, (req, res, next) => ctrl.refresh(req, res, next));

export default router;
