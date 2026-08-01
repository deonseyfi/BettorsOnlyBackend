import { supabase, unwrap } from '../db/supabase';
import { HistoricalLine, LineBetType, LineResult } from '../types';

export interface CreateHistoricalLineData {
  game_id: string;
  sport: string;
  home_team: string;
  away_team: string;
  book: string;
  bet_type: LineBetType;
  line_value: number;
  juice: number;
  final_score_home?: number | null;
  final_score_away?: number | null;
  result?: LineResult | null;
}

export interface UpdateHistoricalLineData {
  final_score_home?: number | null;
  final_score_away?: number | null;
  result?: LineResult | null;
}

const TABLE = 'historical_lines';

export const historicalLineDao = {
  async findByGameId(gameId: string): Promise<HistoricalLine[]> {
    const data = unwrap(
      await supabase
        .from(TABLE)
        .select('*')
        .eq('game_id', gameId)
        .order('recorded_at', { ascending: false })
    );
    return (data as HistoricalLine[] | null) ?? [];
  },

  async findBySport(sport: string, limit = 100): Promise<HistoricalLine[]> {
    const data = unwrap(
      await supabase
        .from(TABLE)
        .select('*')
        .eq('sport', sport)
        .order('recorded_at', { ascending: false })
        .range(0, limit - 1)
    );
    return (data as HistoricalLine[] | null) ?? [];
  },

  async create(data: CreateHistoricalLineData): Promise<HistoricalLine> {
    const row = unwrap(
      await supabase
        .from(TABLE)
        .insert({
          game_id: data.game_id,
          sport: data.sport,
          home_team: data.home_team,
          away_team: data.away_team,
          book: data.book,
          bet_type: data.bet_type,
          line_value: data.line_value,
          juice: data.juice,
          final_score_home: data.final_score_home ?? null,
          final_score_away: data.final_score_away ?? null,
          result: data.result ?? null,
        })
        .select('*')
        .single()
    );
    return row as HistoricalLine;
  },

  async update(id: string, data: UpdateHistoricalLineData): Promise<HistoricalLine | null> {
    if (Object.values(data).every(v => v === undefined)) return null;
    const row = unwrap(
      await supabase.from(TABLE).update(data).eq('id', id).select('*').maybeSingle()
    );
    return (row as HistoricalLine | null) ?? null;
  },
};
