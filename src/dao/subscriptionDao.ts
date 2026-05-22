import pool from '../db/pool';
import { buildUpdateSet } from '../db/helpers';
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

export const subscriptionDao = {
  async findById(id: string): Promise<Subscription | null> {
    const { rows } = await pool.query<Subscription>(
      'SELECT * FROM public.subscriptions WHERE id = $1',
      [id]
    );
    return rows[0] ?? null;
  },

  async findBySubscriberId(subscriberId: string): Promise<Subscription[]> {
    const { rows } = await pool.query<Subscription>(
      'SELECT * FROM public.subscriptions WHERE subscriber_id = $1 ORDER BY created_at DESC',
      [subscriberId]
    );
    return rows;
  },

  async findByCapperId(capperId: string): Promise<Subscription[]> {
    const { rows } = await pool.query<Subscription>(
      'SELECT * FROM public.subscriptions WHERE capper_id = $1 ORDER BY created_at DESC',
      [capperId]
    );
    return rows;
  },

  async findActive(subscriberId: string, capperId: string): Promise<Subscription | null> {
    const { rows } = await pool.query<Subscription>(
      `SELECT * FROM public.subscriptions
       WHERE subscriber_id = $1 AND capper_id = $2 AND status = 'active'`,
      [subscriberId, capperId]
    );
    return rows[0] ?? null;
  },

  async findByStripeSubscriptionId(stripeId: string): Promise<Subscription | null> {
    const { rows } = await pool.query<Subscription>(
      'SELECT * FROM public.subscriptions WHERE stripe_subscription_id = $1',
      [stripeId]
    );
    return rows[0] ?? null;
  },

  async create(data: CreateSubscriptionData): Promise<Subscription> {
    const { rows } = await pool.query<Subscription>(
      `INSERT INTO public.subscriptions
         (subscriber_id, capper_id, status, tier_at_subscribe, price_cents,
          stripe_subscription_id, current_period_start, current_period_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        data.subscriber_id,
        data.capper_id,
        data.status ?? 'active',
        data.tier_at_subscribe,
        data.price_cents,
        data.stripe_subscription_id ?? null,
        data.current_period_start,
        data.current_period_end,
      ]
    );
    return rows[0];
  },

  async update(id: string, data: UpdateSubscriptionData): Promise<Subscription | null> {
    const { setClauses, values, nextIndex } = buildUpdateSet(data);
    if (!setClauses) return this.findById(id);
    const { rows } = await pool.query<Subscription>(
      `UPDATE public.subscriptions SET ${setClauses} WHERE id = $${nextIndex} RETURNING *`,
      [...values, id]
    );
    return rows[0] ?? null;
  },
};
