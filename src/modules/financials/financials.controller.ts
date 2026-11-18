import { Request, Response, NextFunction } from 'express';
import { FinancialsService } from './financials.service';
import { sendSuccess, sendCreated, sendValidationError } from '../../utils/response';

const svc = new FinancialsService();

export class FinancialsController {
  async getEarnings(req: Request, res: Response, next: NextFunction) {
    try {
      const period = (req.query.period as string) || 'month';
      sendSuccess(res, await svc.getEarningsSummary(req.user!.driverProfileId!, period));
    } catch (err) { next(err); }
  }
  async listExpenses(req: Request, res: Response, next: NextFunction) {
    try { sendSuccess(res, await svc.listExpenses(req.user!.driverProfileId!)); } catch (err) { next(err); }
  }
  async addExpense(req: Request, res: Response, next: NextFunction) {
    try {
      const { amount, category, description, expenseDate } = req.body;
      if (!amount || !category) return sendValidationError(res, 'amount and category required');
      sendCreated(res, await svc.addExpense(req.user!.driverProfileId!, { amount, category, description, expenseDate }));
    } catch (err) { next(err); }
  }
  async deleteExpense(req: Request, res: Response, next: NextFunction) {
    try {
      await svc.deleteExpense(req.params.id, req.user!.driverProfileId!);
      sendSuccess(res, null, 'Expense deleted');
    } catch (err) { next(err); }
  }
}
