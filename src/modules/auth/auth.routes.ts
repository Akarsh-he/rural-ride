import { Router } from 'express';
import { AuthController } from './auth.controller';
import { authLimiter } from '../../middleware/rateLimiter';
import { optionalAuth } from '../../middleware/auth';

const router = Router();
const ctrl = new AuthController();

// Real Phone OTP & Username Auth routes
router.post('/send-otp', authLimiter, (req, res, next) => ctrl.sendOtp(req, res, next));
router.post('/verify-otp', authLimiter, (req, res, next) => ctrl.verifyOtp(req, res, next));
router.post('/check-username', (req, res, next) => ctrl.checkUsername(req, res, next));
router.post('/create-username', optionalAuth, (req, res, next) => ctrl.createUsername(req, res, next));

// Legacy & Firebase Token routes
router.post('/verify', authLimiter, (req, res, next) => ctrl.verify(req, res, next));
router.post('/refresh', authLimiter, (req, res, next) => ctrl.refresh(req, res, next));

export default router;
