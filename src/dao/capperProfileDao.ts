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

  // Idempotent provisioning. Two capper-gated requests from the same page load
  // race here (the Profile page fires GET /cappers/me and GET /cappers/me/picks
  // in parallel), so both can see no row and both try to insert. `ON CONFLICT DO
  // NOTHING` lets the loser fall through to the winner's row instead of blowing
  // up with 23505 on capper_profiles_user_id_key.
  async ensure(data: CreateCapperProfileData): Promise<CapperProfile> {
    unwrap(
      await supabase.from(TABLE).upsert(
        {
          user_id: data.user_id,
          bio: data.bio ?? null,
          monthly_price_cents: data.monthly_price_cents ?? 0,
          single_pick_price_cents: data.single_pick_price_cents ?? 0,
        },
        { onConflict: 'user_id', ignoreDuplicates: true }
      )
    );
    // `ignoreDuplicates` returns no rows, so read the row back either way.
    const row = await this.findByUserId(data.user_id);
    if (!row) throw new Error(`capper profile missing for user ${data.user_id} immediately after upsert`);
    return row;
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
    // The `public.leaderboard` view filters to `tier != 'none' AND total_picks >= 20`,
    // which hides every capper until they qualify. During ramp-up we want to show
    // anyone who's submitted at least one pick, sorted by units won. Direct join
    // via PostgREST — the FK `capper_profiles.user_id → profiles.id` powers the
    // embedded select.
    type Row = CapperProfile & {
      profiles: { username: string; display_name: string | null; avatar_url: string | null } | null;
    };
    const rows = unwrap(
      await supabase
        .from(TABLE)
        .select('id, tier, win_rate_30d, roi_30d, units_profit_30d, total_picks, current_streak, monthly_price_cents, profiles!user_id(username, display_name, avatar_url)')
        .eq('is_suspended', false)
        .gte('total_picks', 1)
        .order('units_profit_30d', { ascending: false })
    ) as Row[] | null ?? [];

    return rows.map(r => ({
      capper_id:            r.id,
      username:             r.profiles?.username ?? 'unknown',
      display_name:         r.profiles?.display_name ?? null,
      avatar_url:           r.profiles?.avatar_url ?? null,
      tier:                 r.tier,
      win_rate_30d:         r.win_rate_30d,
      roi_30d:              r.roi_30d,
      units_profit_30d:     r.units_profit_30d,
      total_picks:          r.total_picks,
      current_streak:       r.current_streak,
      monthly_price_cents:  r.monthly_price_cents,
    }));
  },

  async delete(id: string): Promise<void> {
    unwrap(await supabase.from(TABLE).delete().eq('id', id));
  },
};
