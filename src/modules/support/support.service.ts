import { query } from '../../config/database';
import { NotFoundError } from '../../middleware/errorHandler';

export class SupportService {
  async createTicket(userId: string, data: { subject: string; description: string; category: string; relatedBookingId?: string }) {
    const r = await query(
      `INSERT INTO support_tickets (user_id, subject, description, category, related_booking_id, status)
       VALUES ($1,$2,$3,$4,$5,'open') RETURNING *`,
      [userId, data.subject, data.description, data.category, data.relatedBookingId ?? null]
    );
    return r.rows[0];
  }

  async getTickets(userId: string, role: string) {
    const isAdmin = role === 'admin' || role === 'support';
    const r = isAdmin
      ? await query('SELECT * FROM support_tickets ORDER BY created_at DESC LIMIT 100')
      : await query('SELECT * FROM support_tickets WHERE user_id=$1 ORDER BY created_at DESC', [userId]);
    return r.rows;
  }

  async getTicket(id: string) {
    const r = await query('SELECT * FROM support_tickets WHERE id=$1', [id]);
    if (!r.rows.length) throw new NotFoundError('Ticket');
    const messages = await query('SELECT * FROM support_messages WHERE ticket_id=$1 ORDER BY created_at', [id]);
    return { ...r.rows[0], messages: messages.rows };
  }

  async addMessage(ticketId: string, senderId: string, role: string, message: string) {
    const senderType = (role === 'admin' || role === 'support') ? 'admin' : 'user';
    const r = await query(
      `INSERT INTO support_messages (ticket_id, sender_id, sender_type, message) VALUES ($1,$2,$3,$4) RETURNING *`,
      [ticketId, senderId, senderType, message]
    );
    await query(`UPDATE support_tickets SET status='in_progress', updated_at=NOW() WHERE id=$1 AND status='open'`, [ticketId]);
    return r.rows[0];
  }

  async closeTicket(id: string) {
    await query(`UPDATE support_tickets SET status='closed', updated_at=NOW() WHERE id=$1`, [id]);
  }
}
