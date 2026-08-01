import { Request, Response, NextFunction } from 'express';
import { capperProfileDao, profileDao } from '../dao';

// Auto-provisioning gate: every authenticated user is treated as a capper.
// If they don't have a capper_profiles row yet, we create one with default
// zero values. The capper_profiles.user_id has a FK to profiles.id, so if
// the profiles row is also missing (e.g. the auth.users → profiles trigger
// wasn't installed before the account existed) we back-fill that first using
// the metadata we got from the Supabase token.
export async function requireCapper(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  let capper = await capperProfileDao.findByUserId(req.user.id);

  if (!capper) {
    try {
      // 1. Make sure the profiles row exists (FK target).
      const meta = req.user.user_metadata ?? {};
      const fallbackName = (req.user.email ?? '').split('@')[0] || `user_${req.user.id.slice(0, 8)}`;
      await profileDao.ensure(
        req.user.id,
        (meta.username as string) || fallbackName,
        (meta.display_name as string) || null
      );

      // 2. Create the capper_profiles row with sensible zero defaults.
      capper = await capperProfileDao.create({
        user_id: req.user.id,
        bio: null,
        monthly_price_cents: 0,
        single_pick_price_cents: 0,
      });

      // 3. Promote the profile to match — non-blocking; capper row is the source of truth.
      profileDao.update(req.user.id, { role: 'capper', is_capper: true }).catch(() => { /* ignore */ });
    } catch (e) {
      console.error('[requireCapper] auto-provision failed:', e);
      res.status(500).json({
        error: `Could not provision capper profile: ${(e as Error).message}`,
      });
      return;
    }
  }

  if (capper.is_suspended) {
    res.status(403).json({ error: 'Capper account is suspended' });
    return;
  }

  next();
}
