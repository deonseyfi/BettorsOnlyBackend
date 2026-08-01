import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { ipLimiter, deviceLimiter } from './middleware/rateLimiter';
import { originGuard } from './middleware/originGuard';

import webhookRoutes       from './routes/webhookRoutes';
import profileRoutes       from './routes/profileRoutes';
import capperRoutes        from './routes/capperRoutes';
import pickRoutes          from './routes/pickRoutes';
import subscriptionRoutes  from './routes/subscriptionRoutes';
import purchaseRoutes      from './routes/purchaseRoutes';
import postRoutes          from './routes/postRoutes';
import commentRoutes       from './routes/commentRoutes';
import notificationRoutes  from './routes/notificationRoutes';
import pushTokenRoutes     from './routes/pushTokenRoutes';
import oddsRoutes          from './routes/oddsRoutes';
import historicalLineRoutes from './routes/historicalLineRoutes';
import adminRoutes         from './routes/adminRoutes';

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',').map(o => o.trim()).filter(Boolean);

// Allow *.vercel.app previews by default — Vercel gives every push a unique
// preview URL and the exact hostname is unknowable ahead of time. To lock this
// down for production, add specific hostnames to ALLOWED_ORIGINS and unset
// ALLOW_VERCEL_PREVIEWS.
const allowVercelPreviews = process.env.ALLOW_VERCEL_PREVIEWS !== 'false';

app.use(helmet());
app.use(cors({
  origin: (origin, cb) => {
    if (process.env.NODE_ENV !== 'production' || !origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    if (allowVercelPreviews && /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) {
      return cb(null, true);
    }
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
// Secondary origin check that rejects requests without a recognised Origin/Referer
// header in production, even if they somehow bypass CORS (e.g. server-side curl).
app.use(originGuard);

// ── Global rate limiters ───────────────────────────────────────────────────
// ipLimiter    → 100 req / 15 min per IP  (all traffic)
// deviceLimiter→ 200 req / 15 min per X-Device-ID header (when present)
// userLimiter  → 300 req / 15 min per user ID — wired into authenticate()
//                so it runs automatically on every authenticated request.
app.use(ipLimiter);
app.use(deviceLimiter);
// ─────────────────────────────────────────────────────────────────────────

// Stripe webhook must receive the raw body — mount before express.json()
app.use('/api/v1/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);

app.use(express.json());

const v1 = '/api/v1';
app.use(`${v1}/profiles`,      profileRoutes);
app.use(`${v1}/cappers`,       capperRoutes);
app.use(`${v1}/picks`,         pickRoutes);
app.use(`${v1}/subscriptions`, subscriptionRoutes);
app.use(`${v1}/purchases`,     purchaseRoutes);
app.use(`${v1}/posts`,         postRoutes);
app.use(`${v1}`,               commentRoutes);       // /posts/:postId/comments + /comments/:id
app.use(`${v1}/notifications`, notificationRoutes);
app.use(`${v1}/push-tokens`,   pushTokenRoutes);
app.use(`${v1}/odds`,          oddsRoutes);
app.use(`${v1}/lines`,         historicalLineRoutes);
app.use(`${v1}/admin`,         adminRoutes);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

export default app;
