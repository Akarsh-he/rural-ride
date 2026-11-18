import express, { Application, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { createServer } from 'http';

import { config } from './config/env';
import { testConnection } from './config/database';
import { connectRedis } from './config/redis';
import { initFirebase } from './config/firebase';
import { initSocketServer } from './realtime/socket';
import { defaultLimiter } from './middleware/rateLimiter';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';

// Routers
import authRoutes from './modules/auth/auth.routes';
import journeyRoutes from './modules/journeys/journeys.routes';
import bookingRoutes from './modules/bookings/bookings.routes';
import driverRoutes from './modules/drivers/drivers.routes';
import passengerRoutes from './modules/passengers/passengers.routes';
import paymentRoutes from './modules/payments/payments.routes';
import subscriptionRoutes from './modules/subscriptions/subscriptions.routes';
import notificationRoutes from './modules/notifications/notifications.routes';
import supportRoutes from './modules/support/support.routes';
import financialRoutes from './modules/financials/financials.routes';
import adminRoutes from './modules/admin/admin.routes';
import userRoutes from './modules/users/users.routes';
import swaggerUi from 'swagger-ui-express';
import swaggerDocument from './docs/swagger.json';

const app: Application = express();
const httpServer = createServer(app);

// Trust Render's reverse proxy for correct client IP detection
app.set('trust proxy', 1);

// ── Security & Middleware ─────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow any origin with credentials (reflects request origin)
      callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  })
);
app.options('*', cors());
app.use(morgan(config.isProduction ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(defaultLimiter);

// ── Health & Docs ─────────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/journeys', journeyRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/passengers', passengerRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/financials', financialRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);

// ── 404 & Error Handlers ──────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(
  (err: Error, req: Request, res: Response, next: NextFunction) => {
    errorHandler(err, req, res, next);
  }
);

// ── Socket.io ─────────────────────────────────────────────────────────────────
initSocketServer(httpServer);

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  try {
    // Firebase — optional in development
    try { initFirebase(); } catch (e) {
      logger.warn('Firebase not configured — push notifications disabled');
    }

    // PostgreSQL — required; warn clearly if unavailable
    try {
      await testConnection();
    } catch (e) {
      logger.error('PostgreSQL connection failed — database features will not work', { error: (e as Error).message });
      logger.error('Please install PostgreSQL, create the "rural_mobility" database, and set DATABASE_URL in .env');
      if (config.isProduction) process.exit(1);
      logger.warn('Continuing in degraded mode (no database) — only the Admin UI static files will serve');
    }

    // Redis — optional
    await connectRedis();

    httpServer.listen(config.port, () => {
      logger.info(`RuralMobility backend listening on port ${config.port}`, {
        env: config.nodeEnv,
      });
    });
  } catch (err) {
    logger.error('Failed to start server', { error: (err as Error).message });
    process.exit(1);
  }
}

bootstrap();

export { app, httpServer };
