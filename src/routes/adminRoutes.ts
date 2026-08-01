import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/requireAdmin';
import { validateBody, validateParams } from '../middleware/validate';
import { idParam, capperIdParam, suspendCapperBody } from '../validation';
import { capperProfileDao } from '../dao';
import { evaluateAllCappers, evaluateCapper } from '../services/tierService';
import { runAutoGrader } from '../services/autoGrader';

const router = Router();

// POST /api/v1/admin/tiers/evaluate  — run tier evaluation for all cappers
router.post('/tiers/evaluate', authenticate, requireAdmin, async (_req: Request, res: Response) => {
  try {
    res.json(await evaluateAllCappers());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/v1/admin/picks/auto-grade  — run the auto-grader once, on demand.
// The scheduler runs hourly on its own; this is for manual triggers.
router.post('/picks/auto-grade', authenticate, requireAdmin, async (_req: Request, res: Response) => {
  try {
    res.json(await runAutoGrader());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/v1/admin/tiers/evaluate/:capperId  — evaluate a single capper
router.post(
  '/tiers/evaluate/:capperId',
  authenticate,
  requireAdmin,
  validateParams(capperIdParam),
  async (req: Request, res: Response) => {
    try {
      const capper = await capperProfileDao.findById(req.params.capperId as string);
      if (!capper) { res.status(404).json({ error: 'Capper not found' }); return; }
      await evaluateCapper(capper);
      res.json({ message: 'Tier evaluation complete', capperId: capper.id });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// PATCH /api/v1/admin/cappers/:id/suspend
router.patch(
  '/cappers/:id/suspend',
  authenticate,
  requireAdmin,
  validateParams(idParam),
  validateBody(suspendCapperBody),
  async (req: Request, res: Response) => {
    try {
      const { suspended } = req.body as z.infer<typeof suspendCapperBody>;
      const updated = await capperProfileDao.update(req.params.id as string, { is_suspended: suspended });
      if (!updated) { res.status(404).json({ error: 'Capper not found' }); return; }
      res.json(updated);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
