import pool from '../db/pool';
import { PushToken, PushPlatform } from '../types';

export const pushTokenDao = {
  async findByUserId(userId: string): Promise<PushToken[]> {
    const { rows } = await pool.query<PushToken>(
      'SELECT * FROM public.push_tokens WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return rows;
  },

  async upsert(userId: string, token: string, platform: PushPlatform): Promise<PushToken> {
    const { rows } = await pool.query<PushToken>(
      `INSERT INTO public.push_tokens (user_id, token, platform)
       VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE SET user_id = $1, platform = $3
       RETURNING *`,
      [userId, token, platform]
    );
    return rows[0];
  },

  async deleteByToken(token: string): Promise<void> {
    await pool.query('DELETE FROM public.push_tokens WHERE token = $1', [token]);
  },

  async deleteByUserId(userId: string): Promise<void> {
    await pool.query('DELETE FROM public.push_tokens WHERE user_id = $1', [userId]);
  },
};
