import rateLimit from 'express-rate-limit';
import { sendError } from '../utils/response';

const rateLimitHandler = (_req: unknown, res: unknown) => {
  sendError(
    res as Parameters<typeof sendError>[0],
    'Too many requests. Please slow down.',
    429,
    'Rate limit exceeded'
  );
};

/** Default API rate limit: 100 requests per 15 minutes */
export const defaultLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  skip: (req) => req.ip === '127.0.0.1' && process.env.NODE_ENV === 'test',
});

/** Auth endpoints: stricter — 20 requests per 15 minutes */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: (req) => req.ip ?? 'unknown',
});

/** Location update: 60/min per driver (once per second max) */
export const locationUpdateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

/** Booking requests: prevent flooding — 10 per minute */
export const bookingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

/** Payment endpoints: very conservative — 5 per minute */
export const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});
