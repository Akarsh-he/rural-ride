import { Response } from 'express';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  message?: string,
  statusCode = 200,
  meta?: ApiResponse['meta']
): Response {
  const response: ApiResponse<T> = { success: true, data, message, meta };
  return res.status(statusCode).json(response);
}

export function sendCreated<T>(res: Response, data: T, message?: string): Response {
  return sendSuccess(res, data, message, 201);
}

export function sendError(
  res: Response,
  error: string,
  statusCode = 500,
  message?: string
): Response {
  const response: ApiResponse = { success: false, error, message };
  return res.status(statusCode).json(response);
}

export function sendNotFound(res: Response, resource = 'Resource'): Response {
  return sendError(res, `${resource} not found`, 404);
}

export function sendUnauthorized(res: Response, message = 'Unauthorized'): Response {
  return sendError(res, message, 401);
}

export function sendForbidden(res: Response, message = 'Forbidden'): Response {
  return sendError(res, message, 403);
}

export function sendValidationError(res: Response, error: string): Response {
  return sendError(res, error, 422, 'Validation failed');
}

export function sendConflict(res: Response, error: string): Response {
  return sendError(res, error, 409);
}

export function paginationMeta(
  total: number,
  page: number,
  limit: number
): ApiResponse['meta'] {
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}
