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

/** Default API rate limit: generous for dashboard & realtime polling */
export const defaultLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000, // Generous limit: allows frequent dashboard auto-refreshes
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  skip: (req) => {
    // Skip rate limiting for admin endpoints and localhost/internal
    return req.path.startsWith('/api/admin') || req.path === '/health';
  },
});

/** Auth endpoints: 100 requests per 15 minutes */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: (req) => (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown',
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
