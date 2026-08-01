import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireCapper } from '../middleware/requireCapper';
import { strictLimiter } from '../middleware/rateLimiter';
import { validateBody, validateQuery, validateParams } from '../middleware/validate';
import {
  idParam, listCappersQuery, becomeCapperBody,
  updateCapperBody, pickQueryFilters,
} from '../validation';
import { capperProfileDao, capperTierHistoryDao, pickDao, profileDao } from '../dao';
import { PickResult } from '../types';

const router = Router();

// GET /api/v1/cappers/leaderboard  — before /:id to avoid param capture
router.get('/leaderboard', async (_req: Request, res: Response) => {
  try {
    res.json(await capperProfileDao.getLeaderboard());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/v1/cappers
router.get('/', validateQuery(listCappersQuery), async (req: Request, res: Response) => {
  try {
    const { tier, limit, offset } = req.query as unknown as z.infer<typeof listCappersQuery>;
    res.json(await capperProfileDao.list({ tier, is_suspended: false, limit, offset }));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/v1/cappers/me
router.get('/me', authenticate, requireCapper, async (req: Request, res: Response) => {
  try {
    res.json(await capperProfileDao.findByUserId(req.user!.id));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/v1/cappers/me/picks — all of the current capper's picks, including VIP-only.
// Distinct from the public `/cappers/:id/picks` which hardcodes is_vip_only=false.
router.get(
  '/me/picks',
  authenticate,
  requireCapper,
  validateQuery(pickQueryFilters),
  async (req: Request, res: Response) => {
    try {
      const capper = await capperProfileDao.findByUserId(req.user!.id);
      if (!capper) { res.status(404).json({ error: 'Capper profile not found' }); return; }

      const { sport, result, limit, offset } = req.query as unknown as z.infer<typeof pickQueryFilters>;
      // is_vip_only omitted → DAO returns both VIP and public picks for this capper.
      res.json(
        await pickDao.findByCapperId(capper.id, {
          sport, result: result as PickResult | undefined, limit, offset,
        })
      );
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// POST /api/v1/cappers/become
router.post(
  '/become',
  authenticate,
  ...strictLimiter,
  validateBody(becomeCapperBody),
  async (req: Request, res: Response) => {
    const existing = await capperProfileDao.findByUserId(req.user!.id);
    if (existing) { res.status(409).json({ error: 'Already a capper' }); return; }

    const { bio, monthly_price_cents, single_pick_price_cents } =
      req.body as z.infer<typeof becomeCapperBody>;

    // No native transactions over PostgREST — do the insert first (the failure-prone op),
    // then promote the profile. If the profile update fails, delete the capper row to
    // restore consistency. If the cleanup itself fails the user lands in an odd state
    // where they have a capper_profile but role='user'; admin can reconcile manually.
    let capper;
    try {
      capper = await capperProfileDao.create({
        user_id: req.user!.id,
        bio: bio ?? null,
        monthly_price_cents: monthly_price_cents ?? 0,
        single_pick_price_cents: single_pick_price_cents ?? 0,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal server error" });
      return;
    }

    try {
      await profileDao.update(req.user!.id, { role: 'capper', is_capper: true });
      res.status(201).json(capper);
    } catch {
      // Best-effort rollback of the just-inserted capper row.
      try { await capperProfileDao.delete(capper.id); } catch { /* ignore */ }
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// PATCH /api/v1/cappers/me
router.patch(
  '/me',
  authenticate,
  requireCapper,
  validateBody(updateCapperBody),
  async (req: Request, res: Response) => {
    try {
      const capper = await capperProfileDao.findByUserId(req.user!.id);
      const body   = req.body as z.infer<typeof updateCapperBody>;
      res.json(await capperProfileDao.update(capper!.id, body));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// GET /api/v1/cappers/:id
router.get('/:id', validateParams(idParam), async (req: Request, res: Response) => {
  try {
    const capper = await capperProfileDao.findById(req.params.id as string);
    if (!capper) { res.status(404).json({ error: 'Capper not found' }); return; }
    res.json(capper);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/v1/cappers/:id/tier-history
router.get(
  '/:id/tier-history',
  validateParams(idParam),
  async (req: Request, res: Response) => {
    try {
      res.json(await capperTierHistoryDao.findByCapperId(req.params.id as string));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// GET /api/v1/cappers/:id/picks  — public (non-VIP) picks only
router.get(
  '/:id/picks',
  validateParams(idParam),
  validateQuery(pickQueryFilters),
  async (req: Request, res: Response) => {
    try {
      const { sport, result, limit, offset } = req.query as unknown as z.infer<typeof pickQueryFilters>;
      res.json(
        await pickDao.findByCapperId(req.params.id as string, {
          sport, result: result as PickResult | undefined,
          is_vip_only: false, limit, offset,
        })
      );
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
