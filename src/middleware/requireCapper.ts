import { Request, Response, NextFunction } from 'express';
import { capperProfileDao } from '../dao';

export async function requireCapper(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const capper = await capperProfileDao.findByUserId(req.user.id);
  if (!capper) {
    res.status(403).json({ error: 'Capper profile required' });
    return;
  }

  if (capper.is_suspended) {
    res.status(403).json({ error: 'Capper account is suspended' });
    return;
  }

  next();
}
