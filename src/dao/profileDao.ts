import { supabase, unwrap } from '../db/supabase';
import { Profile, UserRole } from '../types';

export interface UpdateProfileData {
  username?: string;
  display_name?: string | null;
  avatar_url?: string | null;
  role?: UserRole;
  is_verified?: boolean;
  is_capper?: boolean;
}

const TABLE = 'profiles';

export const profileDao = {
  async findById(id: string): Promise<Profile | null> {
    const data = unwrap(await supabase.from(TABLE).select('*').eq('id', id).maybeSingle());
    return (data as Profile | null) ?? null;
  },

  async findByUsername(username: string): Promise<Profile | null> {
    const data = unwrap(await supabase.from(TABLE).select('*').eq('username', username).maybeSingle());
    return (data as Profile | null) ?? null;
  },

  async update(id: string, data: UpdateProfileData): Promise<Profile | null> {
    const patch = { ...data, updated_at: new Date().toISOString() };
    const result = unwrap(
      await supabase.from(TABLE).update(patch).eq('id', id).select('*').maybeSingle()
    );
    return (result as Profile | null) ?? null;
  },

  async list(limit = 50, offset = 0): Promise<Profile[]> {
    const data = unwrap(
      await supabase
        .from(TABLE)
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)
    );
    return (data as Profile[] | null) ?? [];
  },

  // Idempotent: inserts the profile row if missing, otherwise leaves the existing row alone.
  // Used as a back-fill when the `on_auth_user_created` trigger wasn't installed
  // before the user signed up.
  async ensure(id: string, username: string, displayName?: string | null): Promise<void> {
    const { error } = await supabase
      .from(TABLE)
      .upsert(
        { id, username, display_name: displayName ?? username },
        { onConflict: 'id', ignoreDuplicates: true }
      );
    if (error) throw new Error(error.message);
  },
};
