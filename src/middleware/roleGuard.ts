import { Request, Response, NextFunction } from 'express';
import { sendForbidden } from '../utils/response';
import { UserRole } from '../types';

function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendForbidden(res, 'Not authenticated');
      return;
    }
    if (!roles.includes(req.user.role)) {
      sendForbidden(
        res,
        `Access denied. Required role: ${roles.join(' or ')}`
      );
      return;
    }
    next();
  };
}

export const requirePassenger = requireRole('passenger');
export const requireDriver = requireRole('driver');
export const requireAdmin = requireRole('admin');
export const requireSupport = requireRole('admin', 'support');
export const requireDriverOrAdmin = requireRole('driver', 'admin');
export const requireAnyRole = requireRole('passenger', 'driver', 'admin', 'support');

/** Guard that also checks driver is verified before accessing driver-only routes */
export function requireVerifiedDriver(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user || req.user.role !== 'driver') {
    sendForbidden(res, 'Driver access required');
    return;
  }
  if (!req.user.driverProfileId) {
    sendForbidden(res, 'Driver profile not found. Please complete registration.');
    return;
  }
  next();
}
