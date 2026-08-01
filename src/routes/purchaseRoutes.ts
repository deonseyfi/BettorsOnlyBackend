import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { strictLimiter } from '../middleware/rateLimiter';
import { validateBody, validateParams } from '../middleware/validate';
import { idParam, createPurchaseBody } from '../validation';
import { pickDao, singlePickPurchaseDao, capperProfileDao } from '../dao';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const router  = Router();

// GET /api/v1/purchases
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    res.json(await singlePickPurchaseDao.findByUserId(req.user!.id));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/v1/purchases  — strict limit: 10 / 15 min per IP + device + user
router.post(
  '/',
  authenticate,
  ...strictLimiter,
  validateBody(createPurchaseBody),
  async (req: Request, res: Response) => {
    try {
      const { pickId } = req.body as z.infer<typeof createPurchaseBody>;

      const pick = await pickDao.findById(pickId);
      if (!pick)              { res.status(404).json({ error: 'Pick not found' });              return; }
      if (!pick.is_vip_only)  { res.status(400).json({ error: 'This pick is free' });           return; }

      const already = await singlePickPurchaseDao.hasPurchased(req.user!.id, pickId);
      if (already) { res.status(409).json({ error: 'Already purchased' }); return; }

      const capper = await capperProfileDao.findById(pick.capper_id);
      if (!capper || capper.single_pick_price_cents === 0) {
        res.status(400).json({ error: 'Pick is not available for individual purchase' }); return;
      }

      const intent = await stripe.paymentIntents.create({
        amount:   capper.single_pick_price_cents,
        currency: 'usd',
        metadata: { user_id: req.user!.id, pick_id: pickId },
      });

      const purchase = await singlePickPurchaseDao.create({
        user_id:                  req.user!.id,
        pick_id:                  pickId,
        amount_cents:             capper.single_pick_price_cents,
        stripe_payment_intent_id: intent.id,
        status:                   'pending',
      });

      res.status(201).json({ purchaseId: purchase.id, clientSecret: intent.client_secret });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
