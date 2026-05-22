import pool from '../db/pool';
import { AppNotification, NotificationType } from '../types';

export interface CreateNotificationData {
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  related_id?: string | null;
}

export const notificationDao = {
  async findByUserId(userId: string, unreadOnly = false): Promise<AppNotification[]> {
    const unreadClause = unreadOnly ? 'AND is_read = false' : '';
    const { rows } = await pool.query<AppNotification>(
      `SELECT * FROM public.notifications
       WHERE user_id = $1 ${unreadClause}
       ORDER BY created_at DESC`,
      [userId]
    );
    return rows;
  },

  async create(data: CreateNotificationData): Promise<AppNotification> {
    const { rows } = await pool.query<AppNotification>(
      `INSERT INTO public.notifications (user_id, type, title, body, related_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.user_id, data.type, data.title, data.body, data.related_id ?? null]
    );
    return rows[0];
  },

  async markRead(id: string): Promise<void> {
    await pool.query(
      'UPDATE public.notifications SET is_read = true WHERE id = $1',
      [id]
    );
  },

  async markAllRead(userId: string): Promise<void> {
    await pool.query(
      'UPDATE public.notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
      [userId]
    );
  },
};
