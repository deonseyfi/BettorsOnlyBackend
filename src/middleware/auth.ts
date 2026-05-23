import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { userLimiter } from './rateLimiter';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  req.user = { id: user.id, email: user.email ?? undefined };

  // Apply per-user rate limit now that req.user is populated.
  // userLimiter calls next() on its own when the limit is not exceeded.
  userLimiter(req, res, next);
}
