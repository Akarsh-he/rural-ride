import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 422);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

/** Global error handler middleware — must be last in Express chain */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  // Operational errors (expected, user-facing)
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error('Operational server error', {
        message: err.message,
        statusCode: err.statusCode,
        path: req.path,
        method: req.method,
      });
    }
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
    return;
  }

  // PostgreSQL unique violation
  const pgError = err as Error & { code?: string; constraint?: string };
  if (pgError.code === '23505') {
    res.status(409).json({
      success: false,
      error: 'A record with this information already exists.',
      detail: pgError.constraint,
    });
    return;
  }

  // PostgreSQL foreign key violation
  if (pgError.code === '23503') {
    res.status(400).json({
      success: false,
      error: 'Referenced record does not exist.',
    });
    return;
  }

  // Unknown / programming errors
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    success: false,
    error:
      process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred. Please try again.'
        : err.message,
  });
}

/** Handle 404 for unmatched routes */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: `Cannot ${req.method} ${req.path}`,
  });
}
