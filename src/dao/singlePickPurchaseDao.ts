import { supabase, unwrap } from '../db/supabase';
import { SinglePickPurchase, PaymentStatus } from '../types';

export interface CreateSinglePickPurchaseData {
  user_id: string;
  pick_id: string;
  amount_cents: number;
  stripe_payment_intent_id?: string | null;
  status?: PaymentStatus;
}

export interface UpdateSinglePickPurchaseData {
  stripe_payment_intent_id?: string | null;
  status?: PaymentStatus;
}

const TABLE = 'single_pick_purchases';

export const singlePickPurchaseDao = {
  async findById(id: string): Promise<SinglePickPurchase | null> {
    const data = unwrap(await supabase.from(TABLE).select('*').eq('id', id).maybeSingle());
    return (data as SinglePickPurchase | null) ?? null;
  },

  async findByUserId(userId: string): Promise<SinglePickPurchase[]> {
    const data = unwrap(
      await supabase
        .from(TABLE)
        .select('*')
        .eq('user_id', userId)
        .order('purchased_at', { ascending: false })
    );
    return (data as SinglePickPurchase[] | null) ?? [];
  },

  async findByPickId(pickId: string): Promise<SinglePickPurchase[]> {
    const data = unwrap(
      await supabase
        .from(TABLE)
        .select('*')
        .eq('pick_id', pickId)
        .order('purchased_at', { ascending: false })
    );
    return (data as SinglePickPurchase[] | null) ?? [];
  },

  async findByStripePaymentIntentId(intentId: string): Promise<SinglePickPurchase | null> {
    const data = unwrap(
      await supabase
        .from(TABLE)
        .select('*')
        .eq('stripe_payment_intent_id', intentId)
        .maybeSingle()
    );
    return (data as SinglePickPurchase | null) ?? null;
  },

  async hasPurchased(userId: string, pickId: string): Promise<boolean> {
    // head + count is the supabase equivalent of SELECT EXISTS — no rows over the wire.
    const { count, error } = await supabase
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('pick_id', pickId)
      .eq('status', 'succeeded');
    if (error) throw new Error(error.message);
    return (count ?? 0) > 0;
  },

  async create(data: CreateSinglePickPurchaseData): Promise<SinglePickPurchase> {
    const row = unwrap(
      await supabase
        .from(TABLE)
        .insert({
          user_id: data.user_id,
          pick_id: data.pick_id,
          amount_cents: data.amount_cents,
          stripe_payment_intent_id: data.stripe_payment_intent_id ?? null,
          status: data.status ?? 'pending',
        })
        .select('*')
        .single()
    );
    return row as SinglePickPurchase;
  },

  async update(id: string, data: UpdateSinglePickPurchaseData): Promise<SinglePickPurchase | null> {
    const row = unwrap(
      await supabase.from(TABLE).update(data).eq('id', id).select('*').maybeSingle()
    );
    return (row as SinglePickPurchase | null) ?? null;
  },
};
