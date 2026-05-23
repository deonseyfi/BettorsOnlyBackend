import { Request, Response, NextFunction } from 'express';

// Comma-separated list of allowed origins, e.g.
// ALLOWED_ORIGINS=https://bettorsonly.app,https://www.bettorsonly.app
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// These paths bypass origin checking:
//  • /health      – load balancer / uptime pings
//  • /api/v1/webhooks – Stripe sends requests from its own servers, not a browser;
//                       those are verified by Stripe signature instead
const BYPASS_PREFIXES = ['/health', '/api/v1/webhooks'];

function isBypassed(path: string): boolean {
  return BYPASS_PREFIXES.some(p => path.startsWith(p));
}

export function originGuard(req: Request, res: Response, next: NextFunction): void {
  if (isBypassed(req.path)) { next(); return; }

  // In development every origin is allowed so local tools (Postman, etc.) work
  if (process.env.NODE_ENV !== 'production') { next(); return; }

  const rawOrigin  = req.headers['origin'];
  const rawReferer = req.headers['referer'];

  // HTTP headers accessed via bracket notation are typed `string | string[] | undefined`
  // by Node.js IncomingHttpHeaders. Normalise to `string | undefined` so downstream
  // comparisons and URL parsing receive a plain string.
  const origin  = Array.isArray(rawOrigin)  ? rawOrigin[0]  : rawOrigin;
  const referer = Array.isArray(rawReferer) ? rawReferer[0] : rawReferer;

  // Production: reject requests that carry no origin at all
  // (direct curl/server-to-server calls that aren't webhooks)
  if (!origin && !referer) {
    res.status(403).json({ error: 'Direct API access is not permitted' });
    return;
  }

  // Resolve the effective origin (prefer Origin header, fall back to Referer)
  let effectiveOrigin = origin ?? '';
  if (!effectiveOrigin && referer) {
    try { effectiveOrigin = new URL(referer).origin; }
    catch { res.status(403).json({ error: 'Malformed Referer header' }); return; }
  }

  if (ALLOWED_ORIGINS.includes(effectiveOrigin)) { next(); return; }

  res.status(403).json({ error: 'Origin not allowed' });
}
