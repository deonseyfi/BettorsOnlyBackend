import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireCapper } from '../middleware/requireCapper';
import { validateBody, validateQuery, validateParams } from '../middleware/validate';
import {
  idParam, pickQueryFilters,
  createPickBody, updatePickBody, gradePickBody,
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
      if (!pick)                       { res.status(404).json({ error: 'Pick not found' });          return; }
      if (pick.capper_id !== capper!.id) { res.status(403).json({ error: 'Forbidden' });             return; }
      if (pick.result    !== 'pending') { res.status(400).json({ error: 'Cannot edit a graded pick' }); return; }

      res.json(await pickDao.update(pick.id, req.body as z.infer<typeof updatePickBody>));
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
      if (!pick)                        { res.status(404).json({ error: 'Pick not found' });  return; }
      if (pick.capper_id !== capper!.id)  { res.status(403).json({ error: 'Forbidden' });      return; }
      if (pick.result    !== 'pending') { res.status(400).json({ error: 'Pick already graded' }); return; }

      const { result, units_result } = req.body as z.infer<typeof gradePickBody>;
      const updated = await pickDao.update(pick.id, { result, units_result: units_result ?? null, graded_at: new Date() });

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
