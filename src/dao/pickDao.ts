import { supabase, unwrap } from '../db/supabase';
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
  game_id?: string;
  bet_type?: BetType;
  pick_details?: Record<string, unknown>;
  odds?: number;
  units?: number;
  is_vip_only?: boolean;
  game_start_at?: Date;
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
  /**
   * 'public' — what a visitor who hasn't paid is allowed to see: picks that were
   * never VIP, plus VIP picks that have already settled. Takes precedence over
   * `is_vip_only`. See isRevealed() for why settled VIP picks stop being paid.
   */
  visibility?: 'public';
}

const TABLE = 'picks';

/**
 * A VIP pick stops being paid content once it settles.
 *
 * The thing a buyer pays for is a bet they can still place; a graded pick is a
 * historical record, and a track record nobody can inspect isn't worth much as
 * a sales pitch. So settled picks are readable by anyone.
 *
 * PUBLIC_VISIBILITY_FILTER is the PostgREST spelling of the same rule — the two
 * are kept adjacent because they must agree: the filter decides which picks get
 * listed, and isRevealed() decides whether a direct fetch of one is allowed.
 */
export function isRevealed(pick: Pick<BetPick, 'is_vip_only' | 'result'>): boolean {
  return !pick.is_vip_only || pick.result !== 'pending';
}

const PUBLIC_VISIBILITY_FILTER = 'is_vip_only.eq.false,result.neq.pending';

export const pickDao = {
  async findById(id: string): Promise<BetPick | null> {
    const data = unwrap(await supabase.from(TABLE).select('*').eq('id', id).maybeSingle());
    return (data as BetPick | null) ?? null;
  },

  async findByCapperId(capperId: string, filters: PickFilters = {}): Promise<BetPick[]> {
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;
    let q = supabase.from(TABLE).select('*').eq('capper_id', capperId);
    if (filters.sport !== undefined) q = q.eq('sport', filters.sport);
    if (filters.result !== undefined) q = q.eq('result', filters.result);
    if (filters.visibility === 'public') {
      q = q.or(PUBLIC_VISIBILITY_FILTER);
    } else if (filters.is_vip_only !== undefined) {
      q = q.eq('is_vip_only', filters.is_vip_only);
    }
    const data = unwrap(
      await q.order('created_at', { ascending: false }).range(offset, offset + limit - 1)
    );
    return (data as BetPick[] | null) ?? [];
  },

  async findPublic(filters: PickFilters = {}): Promise<BetPick[]> {
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;
    let q = supabase.from(TABLE).select('*').eq('is_vip_only', false);
    if (filters.sport !== undefined) q = q.eq('sport', filters.sport);
    if (filters.result !== undefined) q = q.eq('result', filters.result);
    const data = unwrap(
      await q.order('created_at', { ascending: false }).range(offset, offset + limit - 1)
    );
    return (data as BetPick[] | null) ?? [];
  },

  async findByGameId(gameId: string): Promise<BetPick[]> {
    const data = unwrap(
      await supabase
        .from(TABLE)
        .select('*')
        .eq('game_id', gameId)
        .order('created_at', { ascending: false })
    );
    return (data as BetPick[] | null) ?? [];
  },

  async create(data: CreatePickData): Promise<BetPick> {
    const row = unwrap(
      await supabase
        .from(TABLE)
        .insert({
          capper_id: data.capper_id,
          sport: data.sport,
          league: data.league ?? null,
          game_id: data.game_id,
          bet_type: data.bet_type,
          pick_details: data.pick_details ?? {},
          odds: data.odds,
          units: data.units ?? 1.0,
          is_vip_only: data.is_vip_only ?? false,
          game_start_at: data.game_start_at.toISOString(),
        })
        .select('*')
        .single()
    );
    return row as BetPick;
  },

  async update(id: string, data: UpdatePickData): Promise<BetPick | null> {
    const row = unwrap(
      await supabase.from(TABLE).update(toPatch(data)).eq('id', id).select('*').maybeSingle()
    );
    return (row as BetPick | null) ?? null;
  },

  /**
   * Update a pick only while it is still unsettled.
   *
   * The `result = 'pending'` predicate rides along in the UPDATE itself rather
   * than being checked beforehand by the caller, because the auto-grader writes
   * these same rows on an hourly sweep: a pick can settle in the window between
   * a route reading it and writing it back, and a read-then-write would happily
   * rewrite the odds on an already-graded bet. Returns null when the row was
   * settled (or vanished) first — the caller should treat that as a conflict.
   */
  async updateIfPending(id: string, data: UpdatePickData): Promise<BetPick | null> {
    const row = unwrap(
      await supabase
        .from(TABLE)
        .update(toPatch(data))
        .eq('id', id)
        .eq('result', 'pending')
        .is('graded_at', null)
        .select('*')
        .maybeSingle()
    );
    return (row as BetPick | null) ?? null;
  },
};

function toPatch(data: UpdatePickData): Record<string, unknown> {
  const patch: Record<string, unknown> = { ...data };
  if (data.graded_at instanceof Date) patch.graded_at = data.graded_at.toISOString();
  if (data.game_start_at instanceof Date) patch.game_start_at = data.game_start_at.toISOString();
  return patch;
}
