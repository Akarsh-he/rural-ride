import { Request, Response, NextFunction } from 'express';
import { AdminService } from './admin.service';
import { sendSuccess, sendCreated, sendValidationError, sendUnauthorized } from '../../utils/response';

const adminSvc = new AdminService();

export class AdminController {
  // ── Auth ────────────────────────────────────────────────────────

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return sendValidationError(res, 'Email and password are required');
      }
      const result = await adminSvc.login(email, password, req.ip);
      sendSuccess(res, result, 'Admin login successful');
    } catch (err) {
      next(err);
    }
  }

  async getMe(req: Request, res: Response, next: NextFunction) {
    try {
      const admin = await adminSvc.getMe(req.user!.userId);
      sendSuccess(res, admin);
    } catch (err) {
      next(err);
    }
  }

  async logout(_req: Request, res: Response, next: NextFunction) {
    try {
      sendSuccess(res, null, 'Logged out successfully');
    } catch (err) {
      next(err);
    }
  }

  // ── Dashboard Overview ─────────────────────────────────────────

  async getStats(_req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await adminSvc.getDashboardStats();
      sendSuccess(res, stats);
    } catch (err) {
      next(err);
    }
  }

  async getRevenueTrend(req: Request, res: Response, next: NextFunction) {
    try {
      const days = parseInt(req.query.days as string || '30', 10);
      const trend = await adminSvc.getRevenueTrend(days);
      sendSuccess(res, trend);
    } catch (err) {
      next(err);
    }
  }

  async getBookingsChart(req: Request, res: Response, next: NextFunction) {
    try {
      const days = parseInt(req.query.days as string || '7', 10);
      const chart = await adminSvc.getBookingsChart(days);
      sendSuccess(res, chart);
    } catch (err) {
      next(err);
    }
  }

  async getVehicleTypes(_req: Request, res: Response, next: NextFunction) {
    try {
      const types = await adminSvc.getVehicleDistribution();
      sendSuccess(res, types);
    } catch (err) {
      next(err);
    }
  }

  async getActiveDrivers(_req: Request, res: Response, next: NextFunction) {
    try {
      const drivers = await adminSvc.getLiveDrivers();
      sendSuccess(res, drivers);
    } catch (err) {
      next(err);
    }
  }

  async getRecentBookings(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = parseInt(req.query.limit as string || '10', 10);
      const bookings = await adminSvc.getRecentBookings(limit);
      sendSuccess(res, bookings);
    } catch (err) {
      next(err);
    }
  }

  // ── Drivers ────────────────────────────────────────────────────

  async listDrivers(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string || '1', 10);
      const limit = parseInt(req.query.limit as string || '20', 10);
      const status = req.query.status as string | undefined;
      const search = req.query.search as string | undefined;
      const result = await adminSvc.listDrivers(page, limit, status, search);
      sendSuccess(res, result.data, undefined, 200, { total: result.total, page, limit });
    } catch (err) {
      next(err);
    }
  }

  async getDriver(req: Request, res: Response, next: NextFunction) {
    try {
      const driver = await adminSvc.getDriver(req.params.id);
      sendSuccess(res, driver);
    } catch (err) {
      next(err);
    }
  }

  async suspendDriver(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      await adminSvc.suspendDriver(id, reason || 'Suspended by admin', req.user!.userId, req.user!.firebaseUid);
      sendSuccess(res, null, 'Driver suspended successfully');
    } catch (err) {
      next(err);
    }
  }

  async activateDriver(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await adminSvc.activateDriver(id, req.user!.userId, req.user!.firebaseUid);
      sendSuccess(res, null, 'Driver activated successfully');
    } catch (err) {
      next(err);
    }
  }

  async verifyDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const { driverId, docId } = req.params;
      const { reason } = req.body;
      await adminSvc.verifyDriverDocument(driverId, docId, 'approve', reason, req.user!.userId, req.user!.firebaseUid);
      sendSuccess(res, null, 'Document approved');
    } catch (err) {
      next(err);
    }
  }

  async rejectDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const { driverId, docId } = req.params;
      const { reason } = req.body;
      await adminSvc.verifyDriverDocument(driverId, docId, 'reject', reason, req.user!.userId, req.user!.firebaseUid);
      sendSuccess(res, null, 'Document rejected');
    } catch (err) {
      next(err);
    }
  }

  // ── Passengers ─────────────────────────────────────────────────

  async listPassengers(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string || '1', 10);
      const limit = parseInt(req.query.limit as string || '20', 10);
      const status = req.query.status as string | undefined;
      const search = req.query.search as string | undefined;
      const result = await adminSvc.listPassengers(page, limit, status, search);
      sendSuccess(res, result.data, undefined, 200, { total: result.total, page, limit });
    } catch (err) {
      next(err);
    }
  }

  async suspendPassenger(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      await adminSvc.suspendPassenger(id, reason || 'Suspended by admin', req.user!.userId, req.user!.firebaseUid);
      sendSuccess(res, null, 'Passenger suspended');
    } catch (err) {
      next(err);
    }
  }

  async activatePassenger(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await adminSvc.activatePassenger(id, req.user!.userId, req.user!.firebaseUid);
      sendSuccess(res, null, 'Passenger activated');
    } catch (err) {
      next(err);
    }
  }

  // ── Journeys ───────────────────────────────────────────────────

  async listJourneys(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string || '1', 10);
      const limit = parseInt(req.query.limit as string || '20', 10);
      const status = req.query.status as string | undefined;
      const result = await adminSvc.listJourneys(page, limit, status);
      sendSuccess(res, result.data, undefined, 200, { total: result.total, page, limit });
    } catch (err) {
      next(err);
    }
  }

  async cancelJourney(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      await adminSvc.cancelJourney(id, reason || 'Cancelled by admin', req.user!.userId, req.user!.firebaseUid);
      sendSuccess(res, null, 'Journey cancelled');
    } catch (err) {
      next(err);
    }
  }

  // ── Bookings ───────────────────────────────────────────────────

  async listBookings(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string || '1', 10);
      const limit = parseInt(req.query.limit as string || '20', 10);
      const status = req.query.status as string | undefined;
      const result = await adminSvc.listBookings(page, limit, status);
      sendSuccess(res, result.data, undefined, 200, { total: result.total, page, limit });
    } catch (err) {
      next(err);
    }
  }

  // ── Payments ───────────────────────────────────────────────────

  async listPayments(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string || '1', 10);
      const limit = parseInt(req.query.limit as string || '20', 10);
      const status = req.query.status as string | undefined;
      const method = req.query.method as string | undefined;
      const search = req.query.search as string | undefined;
      const result = await adminSvc.listPayments(page, limit, status, method, search);
      sendSuccess(res, result.data, undefined, 200, { total: result.total, page, limit });
    } catch (err) {
      next(err);
    }
  }

  async getPaymentsSummary(_req: Request, res: Response, next: NextFunction) {
    try {
      const summary = await adminSvc.getPaymentsSummary();
      sendSuccess(res, summary);
    } catch (err) {
      next(err);
    }
  }

  // ── Subscriptions ──────────────────────────────────────────────

  async listSubscriptions(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string || '1', 10);
      const limit = parseInt(req.query.limit as string || '20', 10);
      const result = await adminSvc.listSubscriptions(page, limit);
      sendSuccess(res, result.data, undefined, 200, { total: result.total, page, limit });
    } catch (err) {
      next(err);
    }
  }

  // ── Support ────────────────────────────────────────────────────

  async listSupport(req: Request, res: Response, next: NextFunction) {
    try {
      const status = req.query.status as string | undefined;
      const category = req.query.category as string | undefined;
      const tickets = await adminSvc.listSupportTickets(status, category);
      sendSuccess(res, tickets);
    } catch (err) {
      next(err);
    }
  }

  async replySupport(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { message } = req.body;
      if (!message) return sendValidationError(res, 'Message is required');
      await adminSvc.replySupportTicket(id, message, req.user!.userId, req.user!.firebaseUid);
      sendSuccess(res, null, 'Reply sent');
    } catch (err) {
      next(err);
    }
  }

  async closeSupport(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await adminSvc.closeSupportTicket(id, req.user!.userId, req.user!.firebaseUid);
      sendSuccess(res, null, 'Ticket closed');
    } catch (err) {
      next(err);
    }
  }

  // ── Advertisements ─────────────────────────────────────────────

  async listAds(_req: Request, res: Response, next: NextFunction) {
    try {
      const ads = await adminSvc.listAdvertisements();
      sendSuccess(res, ads);
    } catch (err) {
      next(err);
    }
  }

  async createAd(req: Request, res: Response, next: NextFunction) {
    try {
      const ad = await adminSvc.createAdvertisement(req.body, req.user!.userId, req.user!.firebaseUid);
      sendCreated(res, ad, 'Advertisement created');
    } catch (err) {
      next(err);
    }
  }

  async updateAd(req: Request, res: Response, next: NextFunction) {
    try {
      const ad = await adminSvc.updateAdvertisement(req.params.id, req.body, req.user!.userId, req.user!.firebaseUid);
      sendSuccess(res, ad, 'Advertisement updated');
    } catch (err) {
      next(err);
    }
  }

  async toggleAd(req: Request, res: Response, next: NextFunction) {
    try {
      const ad = await adminSvc.toggleAdvertisement(req.params.id, req.user!.userId, req.user!.firebaseUid);
      sendSuccess(res, ad, 'Advertisement status toggled');
    } catch (err) {
      next(err);
    }
  }

  async deleteAd(req: Request, res: Response, next: NextFunction) {
    try {
      await adminSvc.deleteAdvertisement(req.params.id, req.user!.userId, req.user!.firebaseUid);
      sendSuccess(res, null, 'Advertisement deleted');
    } catch (err) {
      next(err);
    }
  }

  // ── Config ─────────────────────────────────────────────────────

  async getConfig(_req: Request, res: Response, next: NextFunction) {
    try {
      const configObj = await adminSvc.getPlatformConfig();
      sendSuccess(res, configObj);
    } catch (err) {
      next(err);
    }
  }

  async updateConfig(req: Request, res: Response, next: NextFunction) {
    try {
      await adminSvc.updatePlatformConfig(req.body, req.user!.userId, req.user!.firebaseUid);
      sendSuccess(res, null, 'Platform configuration updated');
    } catch (err) {
      next(err);
    }
  }
}
