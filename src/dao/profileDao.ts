import pool from '../db/pool';
import { buildUpdateSet } from '../db/helpers';
import { Profile, UserRole } from '../types';

export interface UpdateProfileData {
  username?: string;
  display_name?: string | null;
  avatar_url?: string | null;
  role?: UserRole;
  is_verified?: boolean;
  is_capper?: boolean;
}

export const profileDao = {
  async findById(id: string): Promise<Profile | null> {
    const { rows } = await pool.query<Profile>(
      'SELECT * FROM public.profiles WHERE id = $1',
      [id]
    );
    return rows[0] ?? null;
  },

  async findByUsername(username: string): Promise<Profile | null> {
    const { rows } = await pool.query<Profile>(
      'SELECT * FROM public.profiles WHERE username = $1',
      [username]
    );
    return rows[0] ?? null;
  },

  async update(id: string, data: UpdateProfileData): Promise<Profile | null> {
    const { setClauses, values, nextIndex } = buildUpdateSet({
      ...data,
      updated_at: new Date(),
    });
    if (!setClauses) return this.findById(id);
    const { rows } = await pool.query<Profile>(
      `UPDATE public.profiles SET ${setClauses} WHERE id = $${nextIndex} RETURNING *`,
      [...values, id]
    );
    return rows[0] ?? null;
  },

  async list(limit = 50, offset = 0): Promise<Profile[]> {
    const { rows } = await pool.query<Profile>(
      'SELECT * FROM public.profiles ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return rows;
  },
};
