import { supabase, unwrap } from '../db/supabase';
import { Subscription, SubscriptionStatus, CapperTier } from '../types';

export interface CreateSubscriptionData {
  subscriber_id: string;
  capper_id: string;
  status?: SubscriptionStatus;
  tier_at_subscribe: CapperTier;
  price_cents: number;
  stripe_subscription_id?: string | null;
  current_period_start: Date;
  current_period_end: Date;
}

export interface UpdateSubscriptionData {
  status?: SubscriptionStatus;
  stripe_subscription_id?: string | null;
  current_period_start?: Date;
  current_period_end?: Date;
  cancelled_at?: Date | null;
}

const TABLE = 'subscriptions';

const toIso = (d: Date | null | undefined) => (d instanceof Date ? d.toISOString() : d);

export const subscriptionDao = {
  async findById(id: string): Promise<Subscription | null> {
    const data = unwrap(await supabase.from(TABLE).select('*').eq('id', id).maybeSingle());
    return (data as Subscription | null) ?? null;
  },

  async findBySubscriberId(subscriberId: string): Promise<Subscription[]> {
    const data = unwrap(
      await supabase
        .from(TABLE)
        .select('*')
        .eq('subscriber_id', subscriberId)
        .order('created_at', { ascending: false })
    );
    return (data as Subscription[] | null) ?? [];
  },

  async findByCapperId(capperId: string): Promise<Subscription[]> {
    const data = unwrap(
      await supabase
        .from(TABLE)
        .select('*')
        .eq('capper_id', capperId)
        .order('created_at', { ascending: false })
    );
    return (data as Subscription[] | null) ?? [];
  },

  async findActive(subscriberId: string, capperId: string): Promise<Subscription | null> {
    const data = unwrap(
      await supabase
        .from(TABLE)
        .select('*')
        .eq('subscriber_id', subscriberId)
        .eq('capper_id', capperId)
        .eq('status', 'active')
        .maybeSingle()
    );
    return (data as Subscription | null) ?? null;
  },

  async findByStripeSubscriptionId(stripeId: string): Promise<Subscription | null> {
    const data = unwrap(
      await supabase.from(TABLE).select('*').eq('stripe_subscription_id', stripeId).maybeSingle()
    );
    return (data as Subscription | null) ?? null;
  },

  async create(data: CreateSubscriptionData): Promise<Subscription> {
    const row = unwrap(
      await supabase
        .from(TABLE)
        .insert({
          subscriber_id: data.subscriber_id,
          capper_id: data.capper_id,
          status: data.status ?? 'active',
          tier_at_subscribe: data.tier_at_subscribe,
          price_cents: data.price_cents,
          stripe_subscription_id: data.stripe_subscription_id ?? null,
          current_period_start: data.current_period_start.toISOString(),
          current_period_end: data.current_period_end.toISOString(),
        })
        .select('*')
        .single()
    );
    return row as Subscription;
  },

  async update(id: string, data: UpdateSubscriptionData): Promise<Subscription | null> {
    const patch: Record<string, unknown> = { ...data };
    if (data.current_period_start) patch.current_period_start = toIso(data.current_period_start);
    if (data.current_period_end) patch.current_period_end = toIso(data.current_period_end);
    if (data.cancelled_at instanceof Date) patch.cancelled_at = toIso(data.cancelled_at);

    const row = unwrap(
      await supabase.from(TABLE).update(patch).eq('id', id).select('*').maybeSingle()
    );
    return (row as Subscription | null) ?? null;
  },
};
