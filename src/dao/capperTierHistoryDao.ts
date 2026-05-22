import pool from '../db/pool';
import { CapperTierHistory, CapperTier, TierChangeReason } from '../types';

export interface CreateCapperTierHistoryData {
  capper_id: string;
  old_tier: CapperTier;
  new_tier: CapperTier;
  win_rate_at_change: number;
  reason: TierChangeReason;
}

export const capperTierHistoryDao = {
  async findByCapperId(capperId: string): Promise<CapperTierHistory[]> {
    const { rows } = await pool.query<CapperTierHistory>(
      'SELECT * FROM public.capper_tier_history WHERE capper_id = $1 ORDER BY changed_at DESC',
      [capperId]
    );
    return rows;
  },

  async create(data: CreateCapperTierHistoryData): Promise<CapperTierHistory> {
    const { rows } = await pool.query<CapperTierHistory>(
      `INSERT INTO public.capper_tier_history (capper_id, old_tier, new_tier, win_rate_at_change, reason)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.capper_id, data.old_tier, data.new_tier, data.win_rate_at_change, data.reason]
    );
    return rows[0];
  },
};
