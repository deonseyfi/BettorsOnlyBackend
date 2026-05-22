import pool from '../db/pool';
import { BetComment } from '../types';

export interface CreateCommentData {
  post_id: string;
  author_id: string;
  parent_comment_id?: string | null;
  body: string;
}

export const commentDao = {
  async findByPostId(postId: string): Promise<BetComment[]> {
    const { rows } = await pool.query<BetComment>(
      'SELECT * FROM public.comments WHERE post_id = $1 ORDER BY created_at ASC',
      [postId]
    );
    return rows;
  },

  async create(data: CreateCommentData): Promise<BetComment> {
    const { rows } = await pool.query<BetComment>(
      `INSERT INTO public.comments (post_id, author_id, parent_comment_id, body)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [data.post_id, data.author_id, data.parent_comment_id ?? null, data.body]
    );
    return rows[0];
  },

  async delete(id: string): Promise<void> {
    await pool.query('DELETE FROM public.comments WHERE id = $1', [id]);
  },
};
