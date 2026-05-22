import pool from '../db/pool';
import { PickAccessLog, AccessType } from '../types';

export interface CreatePickAccessLogData {
  pick_id: string;
  user_id: string;
  access_type: AccessType;
}

export const pickAccessLogDao = {
  async create(data: CreatePickAccessLogData): Promise<PickAccessLog> {
    const { rows } = await pool.query<PickAccessLog>(
      `INSERT INTO public.pick_access_log (pick_id, user_id, access_type)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [data.pick_id, data.user_id, data.access_type]
    );
    return rows[0];
  },

  async findByPickId(pickId: string): Promise<PickAccessLog[]> {
    const { rows } = await pool.query<PickAccessLog>(
      'SELECT * FROM public.pick_access_log WHERE pick_id = $1 ORDER BY accessed_at DESC',
      [pickId]
    );
    return rows;
  },

  async findByUserId(userId: string): Promise<PickAccessLog[]> {
    const { rows } = await pool.query<PickAccessLog>(
      'SELECT * FROM public.pick_access_log WHERE user_id = $1 ORDER BY accessed_at DESC',
      [userId]
    );
    return rows;
  },
};
