import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { validateBody, validateQuery, validateParams } from '../middleware/validate';
import {
  idParam, postQueryFilters,
  createPostBody, updatePostBody,
} from '../validation';
import { postDao, subscriptionDao, capperProfileDao } from '../dao';

const router = Router();

// GET /api/v1/posts
router.get('/', validateQuery(postQueryFilters), async (req: Request, res: Response) => {
  try {
    const { sport, author_id, limit, offset } = req.query as unknown as z.infer<typeof postQueryFilters>;
    res.json(await postDao.findPublic({ sport, author_id, limit, offset }));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/v1/posts/:id
router.get('/:id', validateParams(idParam), async (req: Request, res: Response) => {
  try {
    const post = await postDao.findById(req.params.id as string);
    if (!post) { res.status(404).json({ error: 'Post not found' }); return; }

    if (post.is_vip_only) {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Authentication required' }); return;
      }
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
      const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7));
      if (!user) { res.status(401).json({ error: 'Invalid token' }); return; }

      const capper = await capperProfileDao.findByUserId(post.author_id);
      if (!capper) { res.status(403).json({ error: 'VIP access required' }); return; }
      const sub = await subscriptionDao.findActive(user.id, capper.id);
      if (!sub)   { res.status(403).json({ error: 'Active subscription required' }); return; }
    }

    res.json(post);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/v1/posts
router.post(
  '/',
  authenticate,
  validateBody(createPostBody),
  async (req: Request, res: Response) => {
    try {
      const body = req.body as z.infer<typeof createPostBody>;
      res.status(201).json(await postDao.create({ author_id: req.user!.id, ...body }));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// PATCH /api/v1/posts/:id
router.patch(
  '/:id',
  authenticate,
  validateParams(idParam),
  validateBody(updatePostBody),
  async (req: Request, res: Response) => {
    try {
      const post = await postDao.findById(req.params.id as string);
      if (!post)                          { res.status(404).json({ error: 'Post not found' }); return; }
      if (post.author_id !== req.user!.id) { res.status(403).json({ error: 'Forbidden' });     return; }
      res.json(await postDao.update(post.id, req.body as z.infer<typeof updatePostBody>));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// DELETE /api/v1/posts/:id
router.delete(
  '/:id',
  authenticate,
  validateParams(idParam),
  async (req: Request, res: Response) => {
    try {
      const post = await postDao.findById(req.params.id as string);
      if (!post)                          { res.status(404).json({ error: 'Post not found' }); return; }
      if (post.author_id !== req.user!.id) { res.status(403).json({ error: 'Forbidden' });     return; }
      await postDao.delete(post.id);
      res.status(204).send();
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// POST /api/v1/posts/:id/upvote
router.post(
  '/:id/upvote',
  authenticate,
  validateParams(idParam),
  async (req: Request, res: Response) => {
    try {
      const post = await postDao.findById(req.params.id as string);
      if (!post) { res.status(404).json({ error: 'Post not found' }); return; }
      await postDao.incrementUpvotes(post.id);
      res.json({ message: 'Upvoted' });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
