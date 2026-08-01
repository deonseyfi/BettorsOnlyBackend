import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { strictLimiter } from '../middleware/rateLimiter';
import { validateBody, validateParams } from '../middleware/validate';
import { idParam, createSubscriptionBody } from '../validation';
import { subscriptionDao, capperProfileDao, profileDao } from '../dao';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const router  = Router();

async function findOrCreateStripeCustomer(userId: string, email: string): Promise<string> {
  const existing = await stripe.customers.list({ email, limit: 1 });
  if (existing.data.length > 0) return existing.data[0].id;
  const customer = await stripe.customers.create({ email, metadata: { user_id: userId } });
  return customer.id;
}

// GET /api/v1/subscriptions
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    res.json(await subscriptionDao.findBySubscriberId(req.user!.id));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/v1/subscriptions  — strict limit: 10 / 15 min per IP + device + user
router.post(
  '/',
  authenticate,
  ...strictLimiter,
  validateBody(createSubscriptionBody),
  async (req: Request, res: Response) => {
    try {
      const { capperId } = req.body as z.infer<typeof createSubscriptionBody>;

      const capper = await capperProfileDao.findById(capperId);
      if (!capper || capper.is_suspended) {
        res.status(404).json({ error: 'Capper not found' }); return;
      }
      if (capper.monthly_price_cents === 0) {
        res.status(400).json({ error: 'This capper has no paid subscription' }); return;
      }

      const existing = await subscriptionDao.findActive(req.user!.id, capperId);
      if (existing) { res.status(409).json({ error: 'Already subscribed' }); return; }

      const email      = req.user!.email ?? `${req.user!.id}@bettorsonly.app`;
      const customerId = await findOrCreateStripeCustomer(req.user!.id, email);

      const capperProfile = await profileDao.findById(capper.user_id);
      const capperName    = capperProfile?.display_name ?? capperProfile?.username ?? 'Capper';

      // Stripe SDK v17: subscriptions.create items don't accept inline product_data.
      // Create the price object first (which supports product_data), then reference it.
      const price = await stripe.prices.create({
        currency:     'usd',
        unit_amount:  capper.monthly_price_cents,
        recurring:    { interval: 'month' },
        product_data: { name: `${capperName} — Monthly Subscription` },
      });

      const stripeSub = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: price.id }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
      });

      const invoice = stripeSub.latest_invoice as Stripe.Invoice;
      const intent  = invoice.payment_intent  as Stripe.PaymentIntent;

      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      await subscriptionDao.create({
        subscriber_id:          req.user!.id,
        capper_id:              capperId,
        status:                 'active',
        tier_at_subscribe:      capper.tier,
        price_cents:            capper.monthly_price_cents,
        stripe_subscription_id: stripeSub.id,
        current_period_start:   now,
        current_period_end:     periodEnd,
      });

      res.status(201).json({ subscriptionId: stripeSub.id, clientSecret: intent.client_secret });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// DELETE /api/v1/subscriptions/:id
router.delete(
  '/:id',
  authenticate,
  validateParams(idParam),
  async (req: Request, res: Response) => {
    try {
      const sub = await subscriptionDao.findById(req.params.id as string);
      if (!sub)                              { res.status(404).json({ error: 'Subscription not found' }); return; }
      if (sub.subscriber_id !== req.user!.id) { res.status(403).json({ error: 'Forbidden' });              return; }
      if (sub.status        !== 'active')    { res.status(400).json({ error: 'Subscription is not active' }); return; }

      if (sub.stripe_subscription_id) {
        await stripe.subscriptions.cancel(sub.stripe_subscription_id);
      }
      await subscriptionDao.update(sub.id, { status: 'cancelled', cancelled_at: new Date() });
      res.json({ message: 'Subscription cancelled' });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
