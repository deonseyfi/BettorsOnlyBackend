import { supabase, unwrap } from '../db/supabase';
import { AppNotification, NotificationType } from '../types';

export interface CreateNotificationData {
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  related_id?: string | null;
}

const TABLE = 'notifications';

export const notificationDao = {
  async findByUserId(userId: string, unreadOnly = false): Promise<AppNotification[]> {
    let q = supabase.from(TABLE).select('*').eq('user_id', userId);
    if (unreadOnly) q = q.eq('is_read', false);
    const data = unwrap(await q.order('created_at', { ascending: false }));
    return (data as AppNotification[] | null) ?? [];
  },

  async findUserId(id: string): Promise<string | null> {
    const data = unwrap(
      await supabase.from(TABLE).select('user_id').eq('id', id).maybeSingle()
    ) as { user_id: string } | null;
    return data?.user_id ?? null;
  },

  async create(data: CreateNotificationData): Promise<AppNotification> {
    const row = unwrap(
      await supabase
        .from(TABLE)
        .insert({
          user_id: data.user_id,
          type: data.type,
          title: data.title,
          body: data.body,
          related_id: data.related_id ?? null,
        })
        .select('*')
        .single()
    );
    return row as AppNotification;
  },

  async markRead(id: string): Promise<void> {
    unwrap(await supabase.from(TABLE).update({ is_read: true }).eq('id', id));
  },

  async markAllRead(userId: string): Promise<void> {
    unwrap(
      await supabase
        .from(TABLE)
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false)
    );
  },
};
