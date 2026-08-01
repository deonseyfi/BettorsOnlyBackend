import { supabase, unwrap } from '../db/supabase';
import { PushToken, PushPlatform } from '../types';

const TABLE = 'push_tokens';

export const pushTokenDao = {
  async findByUserId(userId: string): Promise<PushToken[]> {
    const data = unwrap(
      await supabase
        .from(TABLE)
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
    );
    return (data as PushToken[] | null) ?? [];
  },

  async upsert(userId: string, token: string, platform: PushPlatform): Promise<PushToken> {
    // `token` has a unique constraint; supabase upsert with onConflict mirrors `ON CONFLICT (token) DO UPDATE`.
    const row = unwrap(
      await supabase
        .from(TABLE)
        .upsert({ user_id: userId, token, platform }, { onConflict: 'token' })
        .select('*')
        .single()
    );
    return row as PushToken;
  },

  async deleteByToken(token: string): Promise<void> {
    unwrap(await supabase.from(TABLE).delete().eq('token', token));
  },

  async deleteByUserId(userId: string): Promise<void> {
    unwrap(await supabase.from(TABLE).delete().eq('user_id', userId));
  },
};
