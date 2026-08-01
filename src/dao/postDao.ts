import { supabase, unwrap } from '../db/supabase';
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

const TABLE = 'posts';

export const postDao = {
  async findById(id: string): Promise<Post | null> {
    const data = unwrap(await supabase.from(TABLE).select('*').eq('id', id).maybeSingle());
    return (data as Post | null) ?? null;
  },

  async findByAuthorId(authorId: string, limit = 50, offset = 0): Promise<Post[]> {
    const data = unwrap(
      await supabase
        .from(TABLE)
        .select('*')
        .eq('author_id', authorId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)
    );
    return (data as Post[] | null) ?? [];
  },

  async findPublic(filters: PostFilters = {}): Promise<Post[]> {
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;
    let q = supabase.from(TABLE).select('*').eq('is_vip_only', false);
    if (filters.sport !== undefined) q = q.eq('sport', filters.sport);
    if (filters.author_id !== undefined) q = q.eq('author_id', filters.author_id);
    const data = unwrap(
      await q.order('created_at', { ascending: false }).range(offset, offset + limit - 1)
    );
    return (data as Post[] | null) ?? [];
  },

  async create(data: CreatePostData): Promise<Post> {
    const row = unwrap(
      await supabase
        .from(TABLE)
        .insert({
          author_id: data.author_id,
          sport: data.sport ?? null,
          league: data.league ?? null,
          title: data.title,
          body: data.body,
          is_vip_only: data.is_vip_only ?? false,
          pick_id: data.pick_id ?? null,
        })
        .select('*')
        .single()
    );
    return row as Post;
  },

  async update(id: string, data: UpdatePostData): Promise<Post | null> {
    const patch = { ...data, updated_at: new Date().toISOString() };
    const row = unwrap(
      await supabase.from(TABLE).update(patch).eq('id', id).select('*').maybeSingle()
    );
    return (row as Post | null) ?? null;
  },

  async incrementUpvotes(id: string): Promise<void> {
    // PostgREST doesn't support `col + 1` expressions. Read-then-write has a small race window;
    // acceptable for a soft upvote counter. For strict accuracy switch to a Postgres function + .rpc().
    const current = unwrap(
      await supabase.from(TABLE).select('upvotes').eq('id', id).maybeSingle()
    ) as { upvotes: number } | null;
    if (!current) return;
    unwrap(await supabase.from(TABLE).update({ upvotes: (current.upvotes ?? 0) + 1 }).eq('id', id));
  },

  async delete(id: string): Promise<void> {
    unwrap(await supabase.from(TABLE).delete().eq('id', id));
  },
};
