import { supabase, unwrap } from '../db/supabase';
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

const TABLE = 'capper_profiles';

export const capperProfileDao = {
  async findById(id: string): Promise<CapperProfile | null> {
    const data = unwrap(await supabase.from(TABLE).select('*').eq('id', id).maybeSingle());
    return (data as CapperProfile | null) ?? null;
  },

  async findByUserId(userId: string): Promise<CapperProfile | null> {
    const data = unwrap(
      await supabase.from(TABLE).select('*').eq('user_id', userId).maybeSingle()
    );
    return (data as CapperProfile | null) ?? null;
  },

  async create(data: CreateCapperProfileData): Promise<CapperProfile> {
    const row = unwrap(
      await supabase
        .from(TABLE)
        .insert({
          user_id: data.user_id,
          bio: data.bio ?? null,
          monthly_price_cents: data.monthly_price_cents ?? 0,
          single_pick_price_cents: data.single_pick_price_cents ?? 0,
        })
        .select('*')
        .single()
    );
    return row as CapperProfile;
  },

  async update(id: string, data: UpdateCapperProfileData): Promise<CapperProfile | null> {
    // Serialize Date → ISO so PostgREST accepts the patch.
    const patch: Record<string, unknown> = { ...data, updated_at: new Date().toISOString() };
    if (data.demotion_warning_at instanceof Date) patch.demotion_warning_at = data.demotion_warning_at.toISOString();
    if (data.last_pick_at instanceof Date) patch.last_pick_at = data.last_pick_at.toISOString();

    const row = unwrap(
      await supabase.from(TABLE).update(patch).eq('id', id).select('*').maybeSingle()
    );
    return (row as CapperProfile | null) ?? null;
  },

  async list(filters: CapperProfileFilters = {}): Promise<CapperProfile[]> {
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;
    let q = supabase.from(TABLE).select('*');
    if (filters.tier !== undefined) q = q.eq('tier', filters.tier);
    if (filters.is_suspended !== undefined) q = q.eq('is_suspended', filters.is_suspended);
    const data = unwrap(
      await q.order('win_rate_30d', { ascending: false }).range(offset, offset + limit - 1)
    );
    return (data as CapperProfile[] | null) ?? [];
  },

  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    // public.leaderboard is a view in the database. Reading via PostgREST works the same as a table.
    const data = unwrap(await supabase.from('leaderboard').select('*'));
    return (data as LeaderboardEntry[] | null) ?? [];
  },

  async delete(id: string): Promise<void> {
    unwrap(await supabase.from(TABLE).delete().eq('id', id));
  },
};
