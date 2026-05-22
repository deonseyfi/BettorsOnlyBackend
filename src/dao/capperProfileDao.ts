import pool from '../db/pool';
import { buildUpdateSet } from '../db/helpers';
import { CapperProfile, CapperTier, LeaderboardEntry } from '../types';

export interface CreateCapperProfileData {
  user_id: string;
  bio?: string | null;
  monthly_price_cents?: number;
  single_pick_price_cents?: number;
}

export interface UpdateCapperProfileData {
  tier?: CapperTier;
  win_rate_30d?: number;
  roi_30d?: number;
  units_profit_30d?: number;
  total_picks?: number;
  picks_last_30d?: number;
  current_streak?: number;
  monthly_price_cents?: number;
  single_pick_price_cents?: number;
  bio?: string | null;
  demotion_warning_at?: Date | null;
  last_pick_at?: Date | null;
  is_suspended?: boolean;
}

export interface CapperProfileFilters {
  tier?: CapperTier;
  is_suspended?: boolean;
  limit?: number;
  offset?: number;
}

export const capperProfileDao = {
  async findById(id: string): Promise<CapperProfile | null> {
    const { rows } = await pool.query<CapperProfile>(
      'SELECT * FROM public.capper_profiles WHERE id = $1',
      [id]
    );
    return rows[0] ?? null;
  },

  async findByUserId(userId: string): Promise<CapperProfile | null> {
    const { rows } = await pool.query<CapperProfile>(
      'SELECT * FROM public.capper_profiles WHERE user_id = $1',
      [userId]
    );
    return rows[0] ?? null;
  },

  async create(data: CreateCapperProfileData): Promise<CapperProfile> {
    const { rows } = await pool.query<CapperProfile>(
      `INSERT INTO public.capper_profiles (user_id, bio, monthly_price_cents, single_pick_price_cents)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        data.user_id,
        data.bio ?? null,
        data.monthly_price_cents ?? 0,
        data.single_pick_price_cents ?? 0,
      ]
    );
    return rows[0];
  },

  async update(id: string, data: UpdateCapperProfileData): Promise<CapperProfile | null> {
    const { setClauses, values, nextIndex } = buildUpdateSet({
      ...data,
      updated_at: new Date(),
    });
    if (!setClauses) return this.findById(id);
    const { rows } = await pool.query<CapperProfile>(
      `UPDATE public.capper_profiles SET ${setClauses} WHERE id = $${nextIndex} RETURNING *`,
      [...values, id]
    );
    return rows[0] ?? null;
  },

  async list(filters: CapperProfileFilters = {}): Promise<CapperProfile[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (filters.tier !== undefined) {
      conditions.push(`tier = $${i++}`);
      values.push(filters.tier);
    }
    if (filters.is_suspended !== undefined) {
      conditions.push(`is_suspended = $${i++}`);
      values.push(filters.is_suspended);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;
    values.push(limit, offset);

    const { rows } = await pool.query<CapperProfile>(
      `SELECT * FROM public.capper_profiles ${where} ORDER BY win_rate_30d DESC LIMIT $${i} OFFSET $${i + 1}`,
      values
    );
    return rows;
  },

  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    const { rows } = await pool.query<LeaderboardEntry>(
      'SELECT * FROM public.leaderboard'
    );
    return rows;
  },
};
