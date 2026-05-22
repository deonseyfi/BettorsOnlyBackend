import pool from '../db/pool';
import { buildUpdateSet } from '../db/helpers';
import { Post } from '../types';

export interface CreatePostData {
  author_id: string;
  sport?: string | null;
  league?: string | null;
  title: string;
  body: string;
  is_vip_only?: boolean;
  pick_id?: string | null;
}

export interface UpdatePostData {
  sport?: string | null;
  league?: string | null;
  title?: string;
  body?: string;
  is_vip_only?: boolean;
  pick_id?: string | null;
}

export interface PostFilters {
  sport?: string;
  author_id?: string;
  limit?: number;
  offset?: number;
}

export const postDao = {
  async findById(id: string): Promise<Post | null> {
    const { rows } = await pool.query<Post>(
      'SELECT * FROM public.posts WHERE id = $1',
      [id]
    );
    return rows[0] ?? null;
  },

  async findByAuthorId(authorId: string, limit = 50, offset = 0): Promise<Post[]> {
    const { rows } = await pool.query<Post>(
      'SELECT * FROM public.posts WHERE author_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [authorId, limit, offset]
    );
    return rows;
  },

  async findPublic(filters: PostFilters = {}): Promise<Post[]> {
    const conditions = ['is_vip_only = false'];
    const values: unknown[] = [];
    let i = 1;

    if (filters.sport !== undefined) {
      conditions.push(`sport = $${i++}`);
      values.push(filters.sport);
    }
    if (filters.author_id !== undefined) {
      conditions.push(`author_id = $${i++}`);
      values.push(filters.author_id);
    }

    values.push(filters.limit ?? 50, filters.offset ?? 0);
    const { rows } = await pool.query<Post>(
      `SELECT * FROM public.posts WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      values
    );
    return rows;
  },

  async create(data: CreatePostData): Promise<Post> {
    const { rows } = await pool.query<Post>(
      `INSERT INTO public.posts (author_id, sport, league, title, body, is_vip_only, pick_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        data.author_id,
        data.sport ?? null,
        data.league ?? null,
        data.title,
        data.body,
        data.is_vip_only ?? false,
        data.pick_id ?? null,
      ]
    );
    return rows[0];
  },

  async update(id: string, data: UpdatePostData): Promise<Post | null> {
    const { setClauses, values, nextIndex } = buildUpdateSet({
      ...data,
      updated_at: new Date(),
    });
    if (!setClauses) return this.findById(id);
    const { rows } = await pool.query<Post>(
      `UPDATE public.posts SET ${setClauses} WHERE id = $${nextIndex} RETURNING *`,
      [...values, id]
    );
    return rows[0] ?? null;
  },

  async incrementUpvotes(id: string): Promise<void> {
    await pool.query(
      'UPDATE public.posts SET upvotes = upvotes + 1 WHERE id = $1',
      [id]
    );
  },

  async delete(id: string): Promise<void> {
    await pool.query('DELETE FROM public.posts WHERE id = $1', [id]);
  },
};
