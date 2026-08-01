import { supabase, unwrap } from '../db/supabase';
import { PickAccessLog, AccessType } from '../types';

export interface CreatePickAccessLogData {
  pick_id: string;
  user_id: string;
  access_type: AccessType;
}

const TABLE = 'pick_access_log';

export const pickAccessLogDao = {
  async create(data: CreatePickAccessLogData): Promise<PickAccessLog> {
    const row = unwrap(
      await supabase.from(TABLE).insert(data).select('*').single()
    );
    return row as PickAccessLog;
  },

  async findByPickId(pickId: string): Promise<PickAccessLog[]> {
    const data = unwrap(
      await supabase
        .from(TABLE)
        .select('*')
        .eq('pick_id', pickId)
        .order('accessed_at', { ascending: false })
    );
    return (data as PickAccessLog[] | null) ?? [];
  },

  async findByUserId(userId: string): Promise<PickAccessLog[]> {
    const data = unwrap(
      await supabase
        .from(TABLE)
        .select('*')
        .eq('user_id', userId)
        .order('accessed_at', { ascending: false })
    );
    return (data as PickAccessLog[] | null) ?? [];
  },
};
