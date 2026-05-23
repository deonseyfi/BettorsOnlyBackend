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
import { capperProfileDao, capperTierHistoryDao, pickDao } from '../dao';
import { PickResult } from '../types';
import pool from '../db/pool';

const router = Router();

// GET /api/v1/cappers/leaderboard  — before /:id to avoid param capture
router.get('/leaderboard', async (_req: Request, res: Response) => {
  try {
    res.json(await capperProfileDao.getLeaderboard());
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/cappers
router.get('/', validateQuery(listCappersQuery), async (req: Request, res: Response) => {
  try {
    const { tier, limit, offset } = req.query as unknown as z.infer<typeof listCappersQuery>;
    res.json(await capperProfileDao.list({ tier, is_suspended: false, limit, offset }));
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/cappers/me
router.get('/me', authenticate, requireCapper, async (req: Request, res: Response) => {
  try {
    res.json(await capperProfileDao.findByUserId(req.user!.id));
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

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

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE public.profiles SET role = 'capper', is_capper = true, updated_at = now() WHERE id = $1`,
        [req.user!.id]
      );
      const { rows } = await client.query(
        `INSERT INTO public.capper_profiles (user_id, bio, monthly_price_cents, single_pick_price_cents)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [req.user!.id, bio ?? null, monthly_price_cents ?? 0, single_pick_price_cents ?? 0]
      );
      await client.query('COMMIT');
      res.status(201).json(rows[0]);
    } catch {
      await client.query('ROLLBACK');
      res.status(500).json({ error: 'Internal server error' });
    } finally {
      client.release();
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
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/v1/cappers/:id
router.get('/:id', validateParams(idParam), async (req: Request, res: Response) => {
  try {
    const capper = await capperProfileDao.findById(req.params.id as string);
    if (!capper) { res.status(404).json({ error: 'Capper not found' }); return; }
    res.json(capper);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/cappers/:id/tier-history
router.get(
  '/:id/tier-history',
  validateParams(idParam),
  async (req: Request, res: Response) => {
    try {
      res.json(await capperTierHistoryDao.findByCapperId(req.params.id as string));
    } catch {
      res.status(500).json({ error: 'Internal server error' });
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
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
