import { Router } from 'express';
import { AdminController } from './admin.controller';
import { authenticate } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/roleGuard';

const router = Router();
const ctrl = new AdminController();

// ── Public Routes ──────────────────────────────────────────────
router.post('/login', ctrl.login.bind(ctrl));

// ── Protected Admin Routes ─────────────────────────────────────
router.use(authenticate, requireAdmin);

// Admin Profile
router.get('/me', ctrl.getMe.bind(ctrl));
router.post('/logout', ctrl.logout.bind(ctrl));

// Dashboard Analytics & Live Tracking
router.get('/dashboard/stats', ctrl.getStats.bind(ctrl));
router.get('/dashboard/revenue', ctrl.getRevenueTrend.bind(ctrl));
router.get('/dashboard/bookings-chart', ctrl.getBookingsChart.bind(ctrl));
router.get('/dashboard/vehicle-types', ctrl.getVehicleTypes.bind(ctrl));
router.get('/dashboard/active-drivers', ctrl.getActiveDrivers.bind(ctrl));
router.get('/dashboard/live-drivers', ctrl.getActiveDrivers.bind(ctrl));
router.get('/dashboard/recent-bookings', ctrl.getRecentBookings.bind(ctrl));

// Also support legacy aliases
router.get('/stats', ctrl.getStats.bind(ctrl));
router.get('/revenue', ctrl.getRevenueTrend.bind(ctrl));

// Drivers Management
router.get('/drivers', ctrl.listDrivers.bind(ctrl));
router.get('/drivers/:id', ctrl.getDriver.bind(ctrl));
router.patch('/drivers/:id/suspend', ctrl.suspendDriver.bind(ctrl));
router.patch('/drivers/:id/activate', ctrl.activateDriver.bind(ctrl));
router.post('/drivers/:id/verify', ctrl.verifyDocument.bind(ctrl)); // legacy alias
router.post('/drivers/:driverId/documents/:docId/verify', ctrl.verifyDocument.bind(ctrl));
router.post('/drivers/:driverId/documents/:docId/reject', ctrl.rejectDocument.bind(ctrl));

// Passengers Management
router.get('/passengers', ctrl.listPassengers.bind(ctrl));
router.patch('/passengers/:id/suspend', ctrl.suspendPassenger.bind(ctrl));
router.patch('/passengers/:id/activate', ctrl.activatePassenger.bind(ctrl));

// Journeys Management
router.get('/journeys', ctrl.listJourneys.bind(ctrl));
router.post('/journeys/:id/cancel', ctrl.cancelJourney.bind(ctrl));

// Bookings Management
router.get('/bookings', ctrl.listBookings.bind(ctrl));

// Payments Management
router.get('/payments', ctrl.listPayments.bind(ctrl));
router.get('/payments/summary', ctrl.getPaymentsSummary.bind(ctrl));

// Subscriptions Management
router.get('/subscriptions', ctrl.listSubscriptions.bind(ctrl));

// Support Tickets
router.get('/support', ctrl.listSupport.bind(ctrl));
router.post('/support/:id/messages', ctrl.replySupport.bind(ctrl));
router.patch('/support/:id/close', ctrl.closeSupport.bind(ctrl));

// Advertisements Management
router.get('/advertisements', ctrl.listAds.bind(ctrl));
router.post('/advertisements', ctrl.createAd.bind(ctrl));
router.put('/advertisements/:id', ctrl.updateAd.bind(ctrl));
router.patch('/advertisements/:id/toggle', ctrl.toggleAd.bind(ctrl));
router.delete('/advertisements/:id', ctrl.deleteAd.bind(ctrl));

// Platform Configuration
router.get('/config', ctrl.getConfig.bind(ctrl));
router.put('/config', ctrl.updateConfig.bind(ctrl));

export default router;
