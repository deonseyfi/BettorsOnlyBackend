import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { validateBody, validateParams } from '../middleware/validate';
import { idParam, updateProfileBody } from '../validation';
import { profileDao } from '../dao';

const router = Router();

// GET /api/v1/profiles/me
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const profile = await profileDao.findById(req.user!.id);
    if (!profile) { res.status(404).json({ error: 'Profile not found' }); return; }
    res.json(profile);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/profiles/:id
router.get('/:id', validateParams(idParam), async (req: Request, res: Response) => {
  try {
    const profile = await profileDao.findById(req.params.id as string);
    if (!profile) { res.status(404).json({ error: 'Profile not found' }); return; }
    res.json(profile);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/v1/profiles/me
router.patch('/me', authenticate, validateBody(updateProfileBody), async (req: Request, res: Response) => {
  try {
    const body = req.body as z.infer<typeof updateProfileBody>;
    const updated = await profileDao.update(req.user!.id, body);
    if (!updated) { res.status(404).json({ error: 'Profile not found' }); return; }
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
