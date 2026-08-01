import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { validateQuery } from '../middleware/validate';
import { oddsQuery } from '../validation';
import { oddsService } from '../services/oddsService';

const router = Router();

// GET /api/v1/odds/sports  — before / to avoid mis-routing
router.get('/sports', async (_req: Request, res: Response) => {
  try {
    const sports = await oddsService.getSports();
    res.json(sports.filter(s => s.active));
  } catch (e) {
    console.error('[odds/sports]', e);
    res.status(502).json({ error: `Unable to fetch sports from odds provider: ${(e as Error).message}` });
  }
});

// GET /api/v1/odds?sport=americanfootball_nfl&regions=us&markets=spreads,h2h,totals
router.get('/', validateQuery(oddsQuery), async (req: Request, res: Response) => {
  try {
    const { sport, regions, markets } = req.query as z.infer<typeof oddsQuery>;
    res.json(await oddsService.getOdds(sport, regions, markets));
  } catch (e) {
    console.error('[odds]', e);
    res.status(502).json({ error: `Unable to fetch odds from odds provider: ${(e as Error).message}` });
  }
});

export default router;
