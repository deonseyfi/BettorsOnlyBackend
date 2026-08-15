import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireCapper } from '../middleware/requireCapper';
import { validateBody, validateQuery, validateParams } from '../middleware/validate';
import {
  idParam, pickQueryFilters,
  createPickBody, updatePickBody, gradePickBody,
  PICK_WAGER_FIELDS,
} from '../validation';
import {
  pickDao, capperProfileDao, subscriptionDao,
  singlePickPurchaseDao, pickAccessLogDao,
} from '../dao';
import { refreshCapperStats } from '../services/capperStatsService';
import { evaluateCapper } from '../services/tierService';

const router = Router();

async function resolveVipAccess(
  userId: string, pickId: string, capperId: string
): Promise<'subscription' | 'single_purchase' | null> {
  const sub = await subscriptionDao.findActive(userId, capperId);
  if (sub) return 'subscription';
  return (await singlePickPurchaseDao.hasPurchased(userId, pickId))
    ? 'single_purchase'
    : null;
}

// GET /api/v1/picks
router.get('/', validateQuery(pickQueryFilters), async (req: Request, res: Response) => {
  try {
    const { sport, result, limit, offset } = req.query as unknown as z.infer<typeof pickQueryFilters>;
    res.json(await pickDao.findPublic({ sport, result, limit, offset }));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/v1/picks/:id
router.get('/:id', validateParams(idParam), async (req: Request, res: Response) => {
  try {
    const pick = await pickDao.findById(req.params.id as string);
    if (!pick) { res.status(404).json({ error: 'Pick not found' }); return; }

    if (pick.is_vip_only) {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Authentication required for VIP picks' }); return;
      }
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
      const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7));
      if (!user) { res.status(401).json({ error: 'Invalid token' }); return; }

      const accessType = await resolveVipAccess(user.id, pick.id, pick.capper_id);
      if (!accessType) {
        res.status(403).json({ error: 'VIP subscription or purchase required' }); return;
      }
      await pickAccessLogDao.create({ pick_id: pick.id, user_id: user.id, access_type: accessType });
    }

    res.json(pick);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/v1/picks
router.post(
  '/',
  authenticate,
  requireCapper,
  validateBody(createPickBody),
  async (req: Request, res: Response) => {
    try {
      const capper = await capperProfileDao.findByUserId(req.user!.id);
      const body   = req.body as z.infer<typeof createPickBody>;
      const pick   = await pickDao.create({ capper_id: capper!.id, ...body });
      res.status(201).json(pick);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// PATCH /api/v1/picks/:id
//
// Edit rules (the record has to mean something, so edits are deliberately narrow):
//   • Only the pick's own capper may edit it — never another user's pick.
//   • A settled pick is immutable — regrading goes through POST /:id/grade.
//     Enforced twice: once here for a clean error message, and again as a
//     predicate on the UPDATE itself, since the auto-grader can settle the pick
//     in between (see pickDao.updateIfPending).
//   • Once the game has started, the wager itself is frozen; only `is_vip_only`
//     can still change. This is the API-side enforcement of the "no backdated
//     picks" rule the Submit form advertises.
//   • A new game_start_at must still be in the future — you can correct a typo'd
//     start time, not retroactively make a live game look un-started.
router.patch(
  '/:id',
  authenticate,
  requireCapper,
  validateParams(idParam),
  validateBody(updatePickBody),
  async (req: Request, res: Response) => {
    try {
      const capper = await capperProfileDao.findByUserId(req.user!.id);
      const pick   = await pickDao.findById(req.params.id as string);
      if (!pick)   { res.status(404).json({ error: 'Pick not found' }); return; }

      // Ownership: the editor must be the capper who submitted this pick.
      if (!capper || pick.capper_id !== capper.id) {
        res.status(403).json({ error: 'You can only edit your own picks' });
        return;
      }

      // Settled: a pick with a result, or a grading timestamp, is final.
      if (pick.result !== 'pending' || pick.graded_at != null) {
        res.status(400).json({ error: 'Cannot edit a settled pick' });
        return;
      }

      const body = req.body as z.infer<typeof updatePickBody>;

      const hasStarted = new Date(pick.game_start_at).getTime() <= Date.now();
      if (hasStarted) {
        const locked = PICK_WAGER_FIELDS.filter(f => f in body);
        if (locked.length > 0) {
          res.status(400).json({
            error:  'The game has already started — only VIP visibility can be changed now',
            fields: locked,
          });
          return;
        }
      }

      if (body.game_start_at && body.game_start_at.getTime() <= Date.now()) {
        res.status(400).json({ error: 'Game start time must be in the future' });
        return;
      }

      // Conditional write — null means the pick was settled underneath us.
      const updated = await pickDao.updateIfPending(pick.id, body);
      if (!updated) {
        res.status(409).json({ error: 'This pick was settled while you were editing it' });
        return;
      }
      res.json(updated);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// POST /api/v1/picks/:id/grade
router.post(
  '/:id/grade',
  authenticate,
  requireCapper,
  validateParams(idParam),
  validateBody(gradePickBody),
  async (req: Request, res: Response) => {
    try {
      const capper = await capperProfileDao.findByUserId(req.user!.id);
      const pick   = await pickDao.findById(req.params.id as string);
      if (!pick)   { res.status(404).json({ error: 'Pick not found' }); return; }
      if (!capper || pick.capper_id !== capper.id) {
        res.status(403).json({ error: 'You can only grade your own picks' });
        return;
      }
      if (pick.result !== 'pending' || pick.graded_at != null) {
        res.status(400).json({ error: 'Pick already graded' });
        return;
      }

      // Same conditional write as the edit path: without the predicate, a grade
      // racing the auto-grader would settle the pick twice and double-fire the
      // stats refresh below.
      const { result, units_result } = req.body as z.infer<typeof gradePickBody>;
      const updated = await pickDao.updateIfPending(pick.id, { result, units_result: units_result ?? null, graded_at: new Date() });
      if (!updated) {
        res.status(409).json({ error: 'This pick was already graded' });
        return;
      }

      // Refresh stats + tier evaluation — non-blocking
      refreshCapperStats(capper!.id)
        .then(() => capperProfileDao.findById(capper!.id))
        .then(cp => cp && evaluateCapper(cp))
        .catch(() => { /* non-critical */ });

      res.json(updated);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
