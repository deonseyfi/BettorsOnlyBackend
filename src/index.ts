import app from './app';
import { startAutoGrader } from './services/autoGrader';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

app.listen(PORT, () => {
  console.log(`BettorsOnly API running on port ${PORT}`);
  // Kick off the hourly auto-grader loop. First run fires 60s after boot;
  // subsequent runs every hour. See src/services/autoGrader.ts.
  startAutoGrader();
  console.log('[autoGrader] scheduler started');
});
