import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { pushTokenBody } from '../validation';
import { pushTokenDao } from '../dao';

const router = Router();

// POST /api/v1/push-tokens
router.post(
  '/',
  authenticate,
  validateBody(pushTokenBody),
  async (req: Request, res: Response) => {
    try {
      const { token, platform } = req.body as z.infer<typeof pushTokenBody>;
      res.status(201).json(await pushTokenDao.upsert(req.user!.id, token, platform));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// DELETE /api/v1/push-tokens/:token
// Note: token values can contain special chars — URL-encode on the client side
router.delete('/:token', authenticate, async (req: Request, res: Response) => {
  try {
    const tokenValue = decodeURIComponent(req.params.token as string);
    if (!tokenValue) { res.status(400).json({ error: 'token param is required' }); return; }

    const tokens = await pushTokenDao.findByUserId(req.user!.id);
    if (!tokens.some(t => t.token === tokenValue)) {
      res.status(404).json({ error: 'Token not found' }); return;
    }

    await pushTokenDao.deleteByToken(tokenValue);
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
