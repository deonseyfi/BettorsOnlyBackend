import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { validateBody, validateParams } from '../middleware/validate';
import { idParam, postIdParam, createCommentBody } from '../validation';
import { commentDao, postDao } from '../dao';

const router = Router();

// GET /api/v1/posts/:postId/comments
router.get(
  '/posts/:postId/comments',
  validateParams(postIdParam),
  async (req: Request, res: Response) => {
    try {
      res.json(await commentDao.findByPostId(req.params.postId as string));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// POST /api/v1/posts/:postId/comments
router.post(
  '/posts/:postId/comments',
  authenticate,
  validateParams(postIdParam),
  validateBody(createCommentBody),
  async (req: Request, res: Response) => {
    try {
      const post = await postDao.findById(req.params.postId as string);
      if (!post) { res.status(404).json({ error: 'Post not found' }); return; }

      const { body, parent_comment_id } = req.body as z.infer<typeof createCommentBody>;
      res.status(201).json(
        await commentDao.create({
          post_id:          req.params.postId as string,
          author_id:        req.user!.id,
          body,
          parent_comment_id,
        })
      );
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// DELETE /api/v1/comments/:id
router.delete(
  '/comments/:id',
  authenticate,
  validateParams(idParam),
  async (req: Request, res: Response) => {
    try {
      const authorId = await commentDao.findAuthorId(req.params.id as string);
      if (authorId === null)               { res.status(404).json({ error: 'Comment not found' }); return; }
      if (authorId !== req.user!.id)       { res.status(403).json({ error: 'Forbidden' });         return; }

      await commentDao.delete(req.params.id as string);
      res.status(204).send();
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
