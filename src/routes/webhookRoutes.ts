import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { subscriptionDao, singlePickPurchaseDao, notificationDao } from '../dao';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const router  = Router();

// POST /api/v1/webhooks/stripe
// Mounted with express.raw() — must be before express.json() in app.ts
router.post('/stripe', async (req: Request, res: Response) => {
  // Normalise string | string[] | undefined → string | undefined
  const rawSig = req.headers['stripe-signature'];
  const sig    = Array.isArray(rawSig) ? rawSig[0] : rawSig;
  if (!sig) { res.status(400).json({ error: 'Missing stripe-signature header' }); return; }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    res.status(400).json({ error: 'Webhook signature verification failed' }); return;
  }

  try {
    switch (event.type) {
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          const sub = await subscriptionDao.findByStripeSubscriptionId(
            invoice.subscription as string
          );
          if (sub) {
            const periodStart = new Date((invoice.period_start ?? 0) * 1000);
            const periodEnd   = new Date((invoice.period_end   ?? 0) * 1000);
            await subscriptionDao.update(sub.id, {
              status:               'active',
              current_period_start: periodStart,
              current_period_end:   periodEnd,
            });
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          const sub = await subscriptionDao.findByStripeSubscriptionId(
            invoice.subscription as string
          );
          if (sub) {
            await subscriptionDao.update(sub.id, { status: 'past_due' });
            await notificationDao.create({
              user_id:    sub.subscriber_id,
              type:       'sub_price_change',
              title:      'Payment failed',
              body:       'Your subscription payment failed. Please update your payment method.',
              related_id: sub.id,
            });
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const stripeSub = event.data.object as Stripe.Subscription;
        const sub = await subscriptionDao.findByStripeSubscriptionId(stripeSub.id);
        if (sub) {
          await subscriptionDao.update(sub.id, {
            status:       'expired',
            cancelled_at: new Date(),
          });
        }
        break;
      }

      case 'payment_intent.succeeded': {
        const intent = event.data.object as Stripe.PaymentIntent;
        const purchase = await singlePickPurchaseDao.findByStripePaymentIntentId(intent.id);
        if (purchase) {
          await singlePickPurchaseDao.update(purchase.id, { status: 'succeeded' });
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const intent = event.data.object as Stripe.PaymentIntent;
        const purchase = await singlePickPurchaseDao.findByStripePaymentIntentId(intent.id);
        if (purchase) {
          await singlePickPurchaseDao.update(purchase.id, { status: 'failed' });
        }
        break;
      }

      default:
        break;
    }

    res.json({ received: true });
  } catch {
    res.status(500).json({ error: 'Webhook handler error' });
  }
});

export default router;
