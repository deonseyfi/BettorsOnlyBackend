import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/requireAdmin';
import { validateBody, validateParams } from '../middleware/validate';
import { idParam, createLineBody, updateLineBody } from '../validation';
import { historicalLineDao } from '../dao';

const router = Router();

// GET /api/v1/lines?game_id=...  OR  ?sport=...
router.get('/', async (req: Request, res: Response) => {
  try {
    const { game_id, sport, limit } = req.query;

    if (typeof game_id === 'string' && game_id.trim()) {
      res.json(await historicalLineDao.findByGameId(game_id.trim()));
    } else if (typeof sport === 'string' && sport.trim()) {
      const parsedLimit = limit ? parseInt(limit as string, 10) : undefined;
      if (parsedLimit !== undefined && (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 500)) {
        res.status(400).json({ error: 'limit must be a number between 1 and 500' }); return;
      }
      res.json(await historicalLineDao.findBySport(sport.trim(), parsedLimit));
    } else {
      res.status(400).json({ error: 'Provide game_id or sport query param' });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/v1/lines  (admin only)
router.post(
  '/',
  authenticate,
  requireAdmin,
  validateBody(createLineBody),
  async (req: Request, res: Response) => {
    try {
      const body = req.body as z.infer<typeof createLineBody>;
      res.status(201).json(await historicalLineDao.create(body));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// PATCH /api/v1/lines/:id  (admin only)
router.patch(
  '/:id',
  authenticate,
  requireAdmin,
  validateParams(idParam),
  validateBody(updateLineBody),
  async (req: Request, res: Response) => {
    try {
      const body    = req.body as z.infer<typeof updateLineBody>;
      const updated = await historicalLineDao.update(req.params.id as string, body);
      if (!updated) { res.status(404).json({ error: 'Line not found' }); return; }
      res.json(updated);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
