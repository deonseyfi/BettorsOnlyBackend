import { supabase, unwrap } from '../db/supabase';
import { capperProfileDao } from '../dao';

// PostgREST doesn't support `COUNT(*) FILTER (...)` aggregations, so we pull the
// relevant rows for one capper and aggregate in JS. Bounded by the 30-day window
// + a hard cap; for normal capper volume this stays well under 1k rows.
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const PICK_FETCH_CAP = 1000;
const STREAK_WINDOW = 20;

type SettledResult = 'win' | 'loss';

export async function refreshCapperStats(capperId: string): Promise<void> {
  const since = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

  // Total pick count — head-only count is one round trip with no rows.
  const totalRes = await supabase
    .from('picks')
    .select('id', { count: 'exact', head: true })
    .eq('capper_id', capperId);
  if (totalRes.error) throw new Error(totalRes.error.message);
  const total_picks = totalRes.count ?? 0;

  // All last-30-day picks for this capper. `result`, `units`, `units_result` is enough.
  const picks30d = unwrap(
    await supabase
      .from('picks')
      .select('result, units, units_result, created_at')
      .eq('capper_id', capperId)
      .gte('created_at', since)
      .range(0, PICK_FETCH_CAP - 1)
  ) as Array<{ result: string; units: number; units_result: number | null }> | null ?? [];

  const settled = picks30d.filter(p => p.result === 'win' || p.result === 'loss');
  const wins = settled.filter(p => p.result === 'win').length;
  const units_profit_30d = settled.reduce((sum, p) => sum + (p.units_result ?? 0), 0);
  const units_wagered_30d = settled.reduce((sum, p) => sum + (p.units ?? 0), 0);

  const win_rate_30d = settled.length > 0
    ? parseFloat(((wins / settled.length) * 100).toFixed(2))
    : 0;

  const roi_30d = units_wagered_30d > 0
    ? parseFloat(((units_profit_30d / units_wagered_30d) * 100).toFixed(2))
    : 0;

  // Current streak — load last 20 settled picks ordered by graded_at.
  const recent = unwrap(
    await supabase
      .from('picks')
      .select('result')
      .eq('capper_id', capperId)
      .in('result', ['win', 'loss'])
      .order('graded_at', { ascending: false, nullsFirst: false })
      .range(0, STREAK_WINDOW - 1)
  ) as Array<{ result: SettledResult }> | null ?? [];

  let streak = 0;
  for (const pick of recent) {
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
    units_profit_30d,
    total_picks,
    picks_last_30d: picks30d.length,
    current_streak: streak,
    last_pick_at: new Date(),
  });
}
