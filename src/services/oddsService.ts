const BASE_URL = 'https://api.the-odds-api.com/v4';

// TTL for the in-memory odds cache. Frontend polls every 15 min, so we serve
// the same cached response to every user in that window — one upstream call
// per (sport, regions, markets) tuple, no matter how many browsers are open.
const CACHE_TTL_MS = 15 * 60 * 1000;

export interface OddsSport {
  key:            string;
  group:          string;
  title:          string;
  description:    string;
  active:         boolean;
  has_outrights:  boolean;
}

export interface OddsOutcome {
  name:   string;
  price:  number;
  point?: number;
}

export interface OddsMarket {
  key:         string;
  last_update: string;
  outcomes:    OddsOutcome[];
}

export interface OddsBookmaker {
  key:         string;
  title:       string;
  last_update: string;
  markets:     OddsMarket[];
}

export interface OddsGame {
  id:            string;
  sport_key:     string;
  sport_title:   string;
  commence_time: string;
  home_team:     string;
  away_team:     string;
  bookmakers:    OddsBookmaker[];
}

export interface ScoreEntry {
  name:  string;
  score: string | null;
}

export interface GameScore {
  id:            string;
  sport_key:     string;
  sport_title:   string;
  commence_time: string;
  completed:     boolean;
  home_team:     string;
  away_team:     string;
  scores:        ScoreEntry[] | null;
  last_update:   string | null;
}

async function apiFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set('apiKey', process.env.ODDS_API_KEY!);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Odds API ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

// ── In-memory cache ──────────────────────────────────────────────────────────
// Keyed by `${sport}::${regions}::${markets}`. Reset on backend restart.
type CacheEntry<T> = { value: T; fetchedAt: number };
const oddsCache = new Map<string, CacheEntry<OddsGame[]>>();
let sportsCache: CacheEntry<OddsSport[]> | null = null;

function cacheAge(entry: CacheEntry<unknown> | null): number {
  return entry ? Date.now() - entry.fetchedAt : Infinity;
}

export const oddsService = {
  async getSports(): Promise<OddsSport[]> {
    if (cacheAge(sportsCache) < CACHE_TTL_MS) return sportsCache!.value;
    const value = await apiFetch<OddsSport[]>('/sports');
    sportsCache = { value, fetchedAt: Date.now() };
    return value;
  },

  // The Odds API market keys: h2h (= moneyline), spreads, totals. NOT 'moneyline'.
  // oddsFormat defaults to decimal — we force american so the UI doesn't need to convert.
  async getOdds(
    sport: string,
    regions = 'us',
    markets = 'h2h,spreads,totals'
  ): Promise<OddsGame[]> {
    const key = `${sport}::${regions}::${markets}`;
    const cached = oddsCache.get(key);
    if (cacheAge(cached ?? null) < CACHE_TTL_MS) return cached!.value;

    const value = await apiFetch<OddsGame[]>(`/sports/${sport}/odds`, {
      regions, markets, oddsFormat: 'american',
    });
    oddsCache.set(key, { value, fetchedAt: Date.now() });
    return value;
  },

  // Not cached — the auto-grader calls this at most every few minutes and needs
  // fresh completion status. Costs `daysFrom` credits per call (up to 3).
  getScores(sport: string, daysFrom = 3): Promise<GameScore[]> {
    return apiFetch<GameScore[]>(`/sports/${sport}/scores`, {
      daysFrom: String(daysFrom),
    });
  },

  // Test hook — lets the auto-grader force a cache invalidation.
  clearCache(): void {
    oddsCache.clear();
    sportsCache = null;
  },
};
