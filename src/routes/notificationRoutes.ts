import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { notificationDao } from '../dao';
import pool from '../db/pool';

const router = Router();

// GET /api/v1/notifications?unread=true
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const unreadOnly = req.query.unread === 'true';
    res.json(await notificationDao.findByUserId(req.user!.id, unreadOnly));
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/v1/notifications/read-all  — must come before /:id
router.patch('/read-all', authenticate, async (req: Request, res: Response) => {
  try {
    await notificationDao.markAllRead(req.user!.id);
    res.json({ message: 'All notifications marked as read' });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/v1/notifications/:id/read
router.patch('/:id/read', authenticate, async (req: Request, res: Response) => {
  try {
    // Ownership check
    const { rows } = await pool.query(
      'SELECT user_id FROM public.notifications WHERE id = $1',
      [req.params.id]
    );
    if (rows.length === 0) { res.status(404).json({ error: 'Notification not found' }); return; }
    if (rows[0].user_id !== req.user!.id) { res.status(403).json({ error: 'Forbidden' }); return; }

    await notificationDao.markRead(req.params.id as string);
    res.json({ message: 'Marked as read' });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
