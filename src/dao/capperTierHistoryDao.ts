import { supabase, unwrap } from '../db/supabase';
import { CapperTierHistory, CapperTier, TierChangeReason } from '../types';

export interface CreateCapperTierHistoryData {
  capper_id: string;
  old_tier: CapperTier;
  new_tier: CapperTier;
  win_rate_at_change: number;
  reason: TierChangeReason;
}

const TABLE = 'capper_tier_history';

export const capperTierHistoryDao = {
  async findByCapperId(capperId: string): Promise<CapperTierHistory[]> {
    const data = unwrap(
      await supabase
        .from(TABLE)
        .select('*')
        .eq('capper_id', capperId)
        .order('changed_at', { ascending: false })
    );
    return (data as CapperTierHistory[] | null) ?? [];
  },

  async create(data: CreateCapperTierHistoryData): Promise<CapperTierHistory> {
    const row = unwrap(
      await supabase.from(TABLE).insert(data).select('*').single()
    );
    return row as CapperTierHistory;
  },
};
