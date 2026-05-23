import pool from '../db/pool';
import { capperProfileDao } from '../dao';

export async function refreshCapperStats(capperId: string): Promise<void> {
  const { rows } = await pool.query<{
    total_picks: number;
    picks_30d: number;
    settled_30d: number;
    wins_30d: number;
    units_profit_30d: number;
    units_wagered_30d: number;
  }>(
    `SELECT
       COUNT(*)::int                                                                     AS total_picks,
       COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int            AS picks_30d,
       COUNT(*) FILTER (
         WHERE created_at >= NOW() - INTERVAL '30 days' AND result IN ('win', 'loss')
       )::int                                                                            AS settled_30d,
       COUNT(*) FILTER (
         WHERE created_at >= NOW() - INTERVAL '30 days' AND result = 'win'
       )::int                                                                            AS wins_30d,
       COALESCE(SUM(units_result) FILTER (
         WHERE created_at >= NOW() - INTERVAL '30 days' AND units_result IS NOT NULL
       ), 0)::float                                                                      AS units_profit_30d,
       COALESCE(SUM(units) FILTER (
         WHERE created_at >= NOW() - INTERVAL '30 days' AND result IN ('win', 'loss')
       ), 0)::float                                                                      AS units_wagered_30d
     FROM public.picks
     WHERE capper_id = $1`,
    [capperId]
  );

  const s = rows[0];

  const win_rate_30d =
    s.settled_30d > 0
      ? parseFloat(((s.wins_30d / s.settled_30d) * 100).toFixed(2))
      : 0;

  const roi_30d =
    s.units_wagered_30d > 0
      ? parseFloat(((s.units_profit_30d / s.units_wagered_30d) * 100).toFixed(2))
      : 0;

  // Current streak: positive = win streak, negative = losing streak
  const { rows: recentPicks } = await pool.query<{ result: string }>(
    `SELECT result FROM public.picks
     WHERE capper_id = $1 AND result IN ('win', 'loss')
     ORDER BY graded_at DESC NULLS LAST
     LIMIT 20`,
    [capperId]
  );

  let streak = 0;
  for (const pick of recentPicks) {
    const isWin = pick.result === 'win';
    if (streak === 0) {
      streak = isWin ? 1 : -1;
    } else if ((streak > 0 && isWin) || (streak < 0 && !isWin)) {
      streak += streak > 0 ? 1 : -1;
    } else {
      break;
    }
  }

  await capperProfileDao.update(capperId, {
    win_rate_30d,
    roi_30d,
    units_profit_30d: s.units_profit_30d,
    total_picks: s.total_picks,
    picks_last_30d: s.picks_30d,
    current_streak: streak,
    last_pick_at: new Date(),
  });
}
