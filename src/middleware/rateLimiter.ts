import rateLimit from 'express-rate-limit';
import { Request, RequestHandler } from 'express';

// ── Helpers ────────────────────────────────────────────────────────────────

function getIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  // x-forwarded-for can be a comma-separated string or an array; take the first value.
  if (Array.isArray(fwd)) return fwd[0].split(',')[0].trim();
  if (typeof fwd === 'string') return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress ?? '0.0.0.0';
}

function getDeviceId(req: Request): string | undefined {
  const val = req.headers['x-device-id'];
  // Normalise string | string[] | undefined → string | undefined
  if (Array.isArray(val)) return val[0];
  return val;
}

const shared = {
  standardHeaders: true,  // sends RateLimit-* headers (RFC 6585)
  legacyHeaders:   false, // disables X-RateLimit-* legacy headers
};

// ── Global limiters — applied to EVERY route in app.ts ────────────────────

/**
 * IP rate limiter.
 * 100 requests per 15 min per IP address.
 * Reads X-Forwarded-For so it works behind a reverse proxy.
 */
export const ipLimiter: RequestHandler = rateLimit({
  ...shared,
  windowMs:     15 * 60 * 1000,
  max:          100,
  keyGenerator: (req) => `ip:${getIp(req)}`,
  message:      { error: 'Too many requests from this IP address. Please try again later.' },
});

/**
 * Device ID limiter.
 * 200 requests per 15 min per X-Device-ID header value.
 * Skipped entirely when the header is absent (IP limiter covers that case).
 */
export const deviceLimiter: RequestHandler = rateLimit({
  ...shared,
  windowMs:     15 * 60 * 1000,
  max:          200,
  skip:         (req) => !getDeviceId(req),
  keyGenerator: (req) => `device:${getDeviceId(req)}`,
  message:      { error: 'Too many requests from this device. Please try again later.' },
});

// ── Per-user limiter — called inside authenticate() after req.user is set ──

/**
 * User account rate limiter.
 * 300 requests per 15 min per authenticated user ID.
 * Falls back to IP when req.user is not set (should not happen if called
 * from within the authenticate middleware).
 */
export const userLimiter: RequestHandler = rateLimit({
  ...shared,
  windowMs:     15 * 60 * 1000,
  max:          300,
  keyGenerator: (req) => `user:${req.user?.id ?? getIp(req)}`,
  message:      { error: 'Too many requests from this account. Please try again later.' },
});

// ── Strict limiters — applied to sensitive / payment endpoints ─────────────

const STRICT_WINDOW = 15 * 60 * 1000; // 15 minutes
const STRICT_MAX    = 10;

/**
 * Strict IP limiter — 10 requests per 15 min per IP.
 * Use on payment, auth, and high-value mutation endpoints.
 */
export const strictIpLimiter: RequestHandler = rateLimit({
  ...shared,
  windowMs:     STRICT_WINDOW,
  max:          STRICT_MAX,
  keyGenerator: (req) => `strict-ip:${getIp(req)}`,
  message:      { error: 'Too many attempts from this IP. Try again in 15 minutes.' },
});

/**
 * Strict device limiter — 10 requests per 15 min per X-Device-ID.
 * Skipped when no header present.
 */
export const strictDeviceLimiter: RequestHandler = rateLimit({
  ...shared,
  windowMs:     STRICT_WINDOW,
  max:          STRICT_MAX,
  skip:         (req) => !getDeviceId(req),
  keyGenerator: (req) => `strict-device:${getDeviceId(req)}`,
  message:      { error: 'Too many attempts from this device. Try again in 15 minutes.' },
});

/**
 * Strict user limiter — 10 requests per 15 min per user ID.
 * Must be placed after authenticate() so req.user is available.
 */
export const strictUserLimiter: RequestHandler = rateLimit({
  ...shared,
  windowMs:     STRICT_WINDOW,
  max:          STRICT_MAX,
  skip:         (req) => !req.user,
  keyGenerator: (req) => `strict-user:${req.user?.id ?? getIp(req)}`,
  message:      { error: 'Too many attempts from this account. Try again in 15 minutes.' },
});

/**
 * Convenience array — spread into a route to enforce ALL three strict limits
 * independently. Any one of them can block the request.
 *
 * Usage (must come after authenticate so req.user is populated):
 *   router.post('/pay', authenticate, ...strictLimiter, handler)
 */
export const strictLimiter: RequestHandler[] = [
  strictIpLimiter,
  strictDeviceLimiter,
  strictUserLimiter,
];
