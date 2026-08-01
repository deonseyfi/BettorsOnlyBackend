import { supabase, unwrap } from '../db/supabase';
import { pickDao, capperProfileDao } from '../dao';
import { BetPick } from '../types';
import { oddsService, GameScore } from './oddsService';
import { refreshCapperStats } from './capperStatsService';
import { evaluateCapper } from './tierService';

// Sports we poll for scores. MLB-only for the current release — matches the
// frontend focus and keeps grader credit spend to ~3 credits/hour (72/day, 2k/mo).
// Add sports here as they come back into scope.
const SPORTS_TO_GRADE = [
  'baseball_mlb',
];

const RUN_INTERVAL_MS = 60 * 60 * 1000; // hourly — covers same-day completions with a big margin
const INITIAL_DELAY_MS = 60 * 1000;      // wait a bit after boot before first run

interface GradeResult {
  result: 'win' | 'loss' | 'push';
  units_result: number;
}

/**
 * Convert American odds + units risked into a units_result value.
 * Positive odds: risk 1 to win odds/100.  e.g. +150 → win 1.5U per unit.
 * Negative odds: risk |odds|/100 to win 1.  e.g. -110 → win 0.909U per unit.
 * Loss returns -units. Push returns 0.
 */
export function unitsResult(result: 'win' | 'loss' | 'push', odds: number, units: number): number {
  if (result === 'push') return 0;
  if (result === 'loss') return -units;
  // win
  const payoutPerUnit = odds > 0 ? odds / 100 : 100 / Math.abs(odds);
  return Number((units * payoutPerUnit).toFixed(4));
}

/**
 * Grade a single pick against a completed game's score.
 * Returns null if the pick can't be graded from this game's data (bad shape).
 */
export function gradePick(pick: BetPick, game: GameScore): GradeResult | null {
  if (!game.completed || !game.scores || game.scores.length < 2) return null;

  const scoreMap = new Map(game.scores.map(s => [s.name, Number(s.score)]));
  const homeScore = scoreMap.get(game.home_team) ?? NaN;
  const awayScore = scoreMap.get(game.away_team) ?? NaN;
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return null;

  const details = pick.pick_details as Record<string, unknown>;
  const team = String(details.team ?? '');
  const point = typeof details.point === 'number' ? details.point : null;
  const market = String(details.market ?? '');

  let result: GradeResult['result'];

  if (pick.bet_type === 'moneyline' || market === 'h2h') {
    // Winner is whoever scored more. Draw = push for sports that allow it (soccer).
    if (homeScore === awayScore) result = 'push';
    else if ((team === game.home_team && homeScore > awayScore) ||
             (team === game.away_team && awayScore > homeScore)) result = 'win';
    else result = 'loss';

  } else if (pick.bet_type === 'spread' || market === 'spreads') {
    if (point == null) return null;
    // The point is applied to the picked team's score. Positive point = underdog, negative = favorite.
    const teamScore = team === game.home_team ? homeScore : team === game.away_team ? awayScore : NaN;
    const otherScore = team === game.home_team ? awayScore : team === game.away_team ? homeScore : NaN;
    if (!Number.isFinite(teamScore)) return null;
    const adjusted = teamScore + point;
    if (adjusted > otherScore) result = 'win';
    else if (adjusted < otherScore) result = 'loss';
    else result = 'push';

  } else if (pick.bet_type === 'total' || market === 'totals') {
    if (point == null) return null;
    const combined = homeScore + awayScore;
    if (combined === point) result = 'push';
    else if (team === 'Over' && combined > point) result = 'win';
    else if (team === 'Under' && combined < point) result = 'win';
    else result = 'loss';

  } else {
    // props, parlays, manual entries — can't be auto-graded from scores alone.
    return null;
  }

  return {
    result,
    units_result: unitsResult(result, pick.odds, pick.units),
  };
}

/**
 * Find all pending picks across all cappers, join them against completed
 * games from The Odds API, and grade the ones we can figure out.
 */
export async function runAutoGrader(): Promise<{ checked: number; graded: number; errors: number }> {
  // 1. Pull every pending pick. There shouldn't be a huge backlog.
  const pending = (unwrap(
    await supabase
      .from('picks')
      .select('*')
      .eq('result', 'pending')
      .lte('game_start_at', new Date().toISOString())
      .range(0, 999)
  ) as BetPick[] | null) ?? [];

  if (pending.length === 0) return { checked: 0, graded: 0, errors: 0 };

  // 2. Fetch scores for each sport we care about, indexed by game_id.
  const scoresByGameId = new Map<string, GameScore>();
  for (const sport of SPORTS_TO_GRADE) {
    try {
      const scores = await oddsService.getScores(sport, 3);
      for (const g of scores) {
        if (g.completed) scoresByGameId.set(g.id, g);
      }
    } catch (e) {
      console.error(`[autoGrader] getScores(${sport}) failed`, e);
    }
  }

  if (scoresByGameId.size === 0) return { checked: pending.length, graded: 0, errors: 0 };

  // 3. Grade whatever matches.
  let graded = 0;
  let errors = 0;
  const capperIdsToRefresh = new Set<string>();

  for (const pick of pending) {
    const game = scoresByGameId.get(pick.game_id);
    if (!game) continue;

    const grade = gradePick(pick, game);
    if (!grade) continue;

    try {
      await pickDao.update(pick.id, {
        result: grade.result,
        units_result: grade.units_result,
        graded_at: new Date(),
      });
      capperIdsToRefresh.add(pick.capper_id);
      graded++;
    } catch (e) {
      console.error('[autoGrader] failed to grade', pick.id, e);
      errors++;
    }
  }

  // 4. Recompute stats and re-evaluate tier for every capper we touched.
  for (const capperId of capperIdsToRefresh) {
    try {
      await refreshCapperStats(capperId);
      const cp = await capperProfileDao.findById(capperId);
      if (cp) await evaluateCapper(cp);
    } catch (e) {
      console.error('[autoGrader] stat refresh failed for capper', capperId, e);
      errors++;
    }
  }

  return { checked: pending.length, graded, errors };
}

let running = false;
let intervalHandle: NodeJS.Timeout | null = null;
let startTimer: NodeJS.Timeout | null = null;

/** Start the background scheduler. Called once on backend boot from index.ts. */
export function startAutoGrader(): void {
  if (intervalHandle || startTimer) return;

  const tick = async () => {
    if (running) return; // don't overlap runs
    running = true;
    const start = Date.now();
    try {
      const stats = await runAutoGrader();
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      if (stats.checked > 0) {
        console.log(`[autoGrader] checked=${stats.checked} graded=${stats.graded} errors=${stats.errors} elapsed=${elapsed}s`);
      }
    } catch (e) {
      console.error('[autoGrader] run failed', e);
    } finally {
      running = false;
    }
  };

  startTimer = setTimeout(() => {
    tick();
    intervalHandle = setInterval(tick, RUN_INTERVAL_MS);
  }, INITIAL_DELAY_MS);
}

/** Test hook — used by the admin/trigger endpoint to run once, on demand. */
export function stopAutoGrader(): void {
  if (intervalHandle) { clearInterval(intervalHandle); intervalHandle = null; }
  if (startTimer)     { clearTimeout(startTimer);     startTimer = null; }
}
