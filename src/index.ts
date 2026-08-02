import app from './app';
import { startAutoGrader } from './services/autoGrader';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
// In production, bind to loopback only — Nginx is the sole entry point and
// terminates TLS + CORS + rate limits. Anyone hitting <public-ip>:3000
// directly would bypass all of that. Dev binds to all interfaces so localhost
// tooling and mobile testing on the LAN still work.
const HOST = process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`BettorsOnly API running on ${HOST}:${PORT}`);
  // Kick off the hourly auto-grader loop. First run fires 60s after boot;
  // subsequent runs every hour. See src/services/autoGrader.ts.
  startAutoGrader();
  console.log('[autoGrader] scheduler started');
});
