import pool from '../db/pool';
import { buildUpdateSet } from '../db/helpers';
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

export const singlePickPurchaseDao = {
  async findById(id: string): Promise<SinglePickPurchase | null> {
    const { rows } = await pool.query<SinglePickPurchase>(
      'SELECT * FROM public.single_pick_purchases WHERE id = $1',
      [id]
    );
    return rows[0] ?? null;
  },

  async findByUserId(userId: string): Promise<SinglePickPurchase[]> {
    const { rows } = await pool.query<SinglePickPurchase>(
      'SELECT * FROM public.single_pick_purchases WHERE user_id = $1 ORDER BY purchased_at DESC',
      [userId]
    );
    return rows;
  },

  async findByPickId(pickId: string): Promise<SinglePickPurchase[]> {
    const { rows } = await pool.query<SinglePickPurchase>(
      'SELECT * FROM public.single_pick_purchases WHERE pick_id = $1 ORDER BY purchased_at DESC',
      [pickId]
    );
    return rows;
  },

  async findByStripePaymentIntentId(intentId: string): Promise<SinglePickPurchase | null> {
    const { rows } = await pool.query<SinglePickPurchase>(
      'SELECT * FROM public.single_pick_purchases WHERE stripe_payment_intent_id = $1',
      [intentId]
    );
    return rows[0] ?? null;
  },

  async hasPurchased(userId: string, pickId: string): Promise<boolean> {
    const { rows } = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM public.single_pick_purchases
         WHERE user_id = $1 AND pick_id = $2 AND status = 'succeeded'
       ) AS exists`,
      [userId, pickId]
    );
    return rows[0].exists;
  },

  async create(data: CreateSinglePickPurchaseData): Promise<SinglePickPurchase> {
    const { rows } = await pool.query<SinglePickPurchase>(
      `INSERT INTO public.single_pick_purchases
         (user_id, pick_id, amount_cents, stripe_payment_intent_id, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        data.user_id,
        data.pick_id,
        data.amount_cents,
        data.stripe_payment_intent_id ?? null,
        data.status ?? 'pending',
      ]
    );
    return rows[0];
  },

  async update(id: string, data: UpdateSinglePickPurchaseData): Promise<SinglePickPurchase | null> {
    const { setClauses, values, nextIndex } = buildUpdateSet(data);
    if (!setClauses) return this.findById(id);
    const { rows } = await pool.query<SinglePickPurchase>(
      `UPDATE public.single_pick_purchases SET ${setClauses} WHERE id = $${nextIndex} RETURNING *`,
      [...values, id]
    );
    return rows[0] ?? null;
  },
};
