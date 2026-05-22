import pool from '../db/pool';
import { buildUpdateSet } from '../db/helpers';
import { BetPick, BetType, PickResult } from '../types';

export interface CreatePickData {
  capper_id: string;
  sport: string;
  league?: string | null;
  game_id: string;
  bet_type: BetType;
  pick_details?: Record<string, unknown>;
  odds: number;
  units?: number;
  is_vip_only?: boolean;
  game_start_at: Date;
}

export interface UpdatePickData {
  sport?: string;
  league?: string | null;
  bet_type?: BetType;
  pick_details?: Record<string, unknown>;
  odds?: number;
  units?: number;
  is_vip_only?: boolean;
  result?: PickResult;
  units_result?: number | null;
  graded_at?: Date | null;
}

export interface PickFilters {
  sport?: string;
  result?: PickResult;
  is_vip_only?: boolean;
  limit?: number;
  offset?: number;
}

export const pickDao = {
  async findById(id: string): Promise<BetPick | null> {
    const { rows } = await pool.query<BetPick>(
      'SELECT * FROM public.picks WHERE id = $1',
      [id]
    );
    return rows[0] ?? null;
  },

  async findByCapperId(capperId: string, filters: PickFilters = {}): Promise<BetPick[]> {
    const conditions = ['capper_id = $1'];
    const values: unknown[] = [capperId];
    let i = 2;

    if (filters.sport !== undefined) {
      conditions.push(`sport = $${i++}`);
      values.push(filters.sport);
    }
    if (filters.result !== undefined) {
      conditions.push(`result = $${i++}`);
      values.push(filters.result);
    }
    if (filters.is_vip_only !== undefined) {
      conditions.push(`is_vip_only = $${i++}`);
      values.push(filters.is_vip_only);
    }

    values.push(filters.limit ?? 50, filters.offset ?? 0);
    const { rows } = await pool.query<BetPick>(
      `SELECT * FROM public.picks WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      values
    );
    return rows;
  },

  async findPublic(filters: PickFilters = {}): Promise<BetPick[]> {
    const conditions = ['is_vip_only = false'];
    const values: unknown[] = [];
    let i = 1;

    if (filters.sport !== undefined) {
      conditions.push(`sport = $${i++}`);
      values.push(filters.sport);
    }
    if (filters.result !== undefined) {
      conditions.push(`result = $${i++}`);
      values.push(filters.result);
    }

    values.push(filters.limit ?? 50, filters.offset ?? 0);
    const { rows } = await pool.query<BetPick>(
      `SELECT * FROM public.picks WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      values
    );
    return rows;
  },

  async findByGameId(gameId: string): Promise<BetPick[]> {
    const { rows } = await pool.query<BetPick>(
      'SELECT * FROM public.picks WHERE game_id = $1 ORDER BY created_at DESC',
      [gameId]
    );
    return rows;
  },

  async create(data: CreatePickData): Promise<BetPick> {
    const { rows } = await pool.query<BetPick>(
      `INSERT INTO public.picks
         (capper_id, sport, league, game_id, bet_type, pick_details, odds, units, is_vip_only, game_start_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        data.capper_id,
        data.sport,
        data.league ?? null,
        data.game_id,
        data.bet_type,
        JSON.stringify(data.pick_details ?? {}),
        data.odds,
        data.units ?? 1.0,
        data.is_vip_only ?? false,
        data.game_start_at,
      ]
    );
    return rows[0];
  },

  async update(id: string, data: UpdatePickData): Promise<BetPick | null> {
    const updateData: Record<string, unknown> = { ...data };
    if (data.pick_details !== undefined) {
      updateData.pick_details = JSON.stringify(data.pick_details);
    }
    const { setClauses, values, nextIndex } = buildUpdateSet(updateData);
    if (!setClauses) return this.findById(id);
    const { rows } = await pool.query<BetPick>(
      `UPDATE public.picks SET ${setClauses} WHERE id = $${nextIndex} RETURNING *`,
      [...values, id]
    );
    return rows[0] ?? null;
  },
};
