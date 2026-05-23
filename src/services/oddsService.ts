const BASE_URL = 'https://api.the-odds-api.com/v4';

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

async function apiFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set('apiKey', process.env.ODDS_API_KEY!);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Odds API ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const oddsService = {
  getSports(): Promise<OddsSport[]> {
    return apiFetch<OddsSport[]>('/sports');
  },

  getOdds(
    sport: string,
    regions = 'us',
    markets = 'spreads,moneyline,totals'
  ): Promise<OddsGame[]> {
    return apiFetch<OddsGame[]>(`/sports/${sport}/odds`, { regions, markets });
  },
};
