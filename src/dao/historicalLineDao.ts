import pool from '../db/pool';
import { buildUpdateSet } from '../db/helpers';
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

export const historicalLineDao = {
  async findByGameId(gameId: string): Promise<HistoricalLine[]> {
    const { rows } = await pool.query<HistoricalLine>(
      'SELECT * FROM public.historical_lines WHERE game_id = $1 ORDER BY recorded_at DESC',
      [gameId]
    );
    return rows;
  },

  async findBySport(sport: string, limit = 100): Promise<HistoricalLine[]> {
    const { rows } = await pool.query<HistoricalLine>(
      'SELECT * FROM public.historical_lines WHERE sport = $1 ORDER BY recorded_at DESC LIMIT $2',
      [sport, limit]
    );
    return rows;
  },

  async create(data: CreateHistoricalLineData): Promise<HistoricalLine> {
    const { rows } = await pool.query<HistoricalLine>(
      `INSERT INTO public.historical_lines
         (game_id, sport, home_team, away_team, book, bet_type, line_value, juice,
          final_score_home, final_score_away, result)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        data.game_id,
        data.sport,
        data.home_team,
        data.away_team,
        data.book,
        data.bet_type,
        data.line_value,
        data.juice,
        data.final_score_home ?? null,
        data.final_score_away ?? null,
        data.result ?? null,
      ]
    );
    return rows[0];
  },

  async update(id: string, data: UpdateHistoricalLineData): Promise<HistoricalLine | null> {
    const { setClauses, values, nextIndex } = buildUpdateSet(data);
    if (!setClauses) return null;
    const { rows } = await pool.query<HistoricalLine>(
      `UPDATE public.historical_lines SET ${setClauses} WHERE id = $${nextIndex} RETURNING *`,
      [...values, id]
    );
    return rows[0] ?? null;
  },
};
