import { supabase, unwrap } from '../db/supabase';
import { BetComment } from '../types';

export interface CreateCommentData {
  post_id: string;
  author_id: string;
  parent_comment_id?: string | null;
  body: string;
}

const TABLE = 'comments';

export const commentDao = {
  async findByPostId(postId: string): Promise<BetComment[]> {
    const data = unwrap(
      await supabase
        .from(TABLE)
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: true })
    );
    return (data as BetComment[] | null) ?? [];
  },

  async findAuthorId(id: string): Promise<string | null> {
    const data = unwrap(
      await supabase.from(TABLE).select('author_id').eq('id', id).maybeSingle()
    ) as { author_id: string } | null;
    return data?.author_id ?? null;
  },

  async create(data: CreateCommentData): Promise<BetComment> {
    const row = unwrap(
      await supabase
        .from(TABLE)
        .insert({
          post_id: data.post_id,
          author_id: data.author_id,
          parent_comment_id: data.parent_comment_id ?? null,
          body: data.body,
        })
        .select('*')
        .single()
    );
    return row as BetComment;
  },

  async delete(id: string): Promise<void> {
    unwrap(await supabase.from(TABLE).delete().eq('id', id));
  },
};
