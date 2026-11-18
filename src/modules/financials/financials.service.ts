import { query } from '../../config/database';
import { NotFoundError } from '../../middleware/errorHandler';

export class FinancialsService {
  async getEarningsSummary(driverProfileId: string, period: string) {
    const intervals: Record<string, string> = { today: '1 day', week: '7 days', month: '30 days', year: '365 days' };
    const interval = intervals[period] || '30 days';
    const r = await query<{ total_earnings: string; total_rides: string; avg_fare: string }>(
      `SELECT COALESCE(SUM(p.driver_earning),0) AS total_earnings,
              COUNT(cb.id) AS total_rides,
              COALESCE(AVG(cb.confirmed_fare),0) AS avg_fare
       FROM confirmed_bookings cb
       LEFT JOIN payments p ON p.booking_id = cb.id AND p.status = 'paid'
       WHERE cb.driver_id = $1 AND cb.status = 'completed'
         AND cb.completion_time >= NOW() - INTERVAL '${interval}'`,
      [driverProfileId]
    );
    return r.rows[0];
  }

  async listExpenses(driverProfileId: string) {
    const r = await query('SELECT * FROM driver_expenses WHERE driver_id=$1 ORDER BY expense_date DESC LIMIT 100', [driverProfileId]);
    return r.rows;
  }

  async addExpense(driverProfileId: string, data: { amount: number; category: string; description?: string; expenseDate?: string }) {
    const r = await query(
      `INSERT INTO driver_expenses (driver_id, amount, category, description, expense_date)
       VALUES ($1,$2,$3,$4,COALESCE($5::date, CURRENT_DATE)) RETURNING *`,
      [driverProfileId, data.amount, data.category, data.description ?? null, data.expenseDate ?? null]
    );
    return r.rows[0];
  }

  async deleteExpense(id: string, driverProfileId: string) {
    const r = await query('DELETE FROM driver_expenses WHERE id=$1 AND driver_id=$2 RETURNING id', [id, driverProfileId]);
    if (!r.rows.length) throw new NotFoundError('Expense');
  }
}
