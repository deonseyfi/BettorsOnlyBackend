import { Request, Response, NextFunction } from 'express';
import { profileDao } from '../dao';

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const profile = await profileDao.findById(req.user.id);
  if (!profile || profile.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
}
