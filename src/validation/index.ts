import { z } from 'zod';

// ── Shared primitives ──────────────────────────────────────────────────────
export const uuid = z.string().uuid('Must be a valid UUID');

export const pagination = z.object({
  limit:  z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// Path-param schemas — applied via validateParams()
export const idParam       = z.object({ id:       uuid });
export const postIdParam   = z.object({ postId:   uuid });
export const capperIdParam = z.object({ capperId: uuid });

// ── Profile ────────────────────────────────────────────────────────────────
export const updateProfileBody = z.object({
  username:     z
    .string()
    .min(3,  'Username must be at least 3 characters')
    .max(40, 'Username must be at most 40 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Only letters, numbers and underscores allowed')
    .optional(),
  display_name: z.string().max(60).nullable().optional(),
  avatar_url:   z.string().url('Must be a valid URL').max(500).nullable().optional(),
}).strict();

// ── Capper ─────────────────────────────────────────────────────────────────
export const becomeCapperBody = z.object({
  bio:                     z.string().max(500).optional(),
  monthly_price_cents:     z.number().int().min(0).max(100_000).optional(),
  single_pick_price_cents: z.number().int().min(0).max(50_000).optional(),
}).strict();

export const updateCapperBody = becomeCapperBody;

export const listCappersQuery = pagination.extend({
  tier: z.enum(['none', 'bronze', 'silver', 'gold', 'platinum']).optional(),
});

// ── Pick ───────────────────────────────────────────────────────────────────
const betTypeEnum    = z.enum(['spread', 'moneyline', 'total', 'prop', 'parlay']);
const pickResultEnum = z.enum(['pending', 'win', 'loss', 'push', 'void']);

export const createPickBody = z.object({
  sport:         z.string().min(1).max(20),
  league:        z.string().max(20).optional(),
  game_id:       z.string().min(1).max(60),
  bet_type:      betTypeEnum,
  pick_details:  z.record(z.unknown()).optional(),
  odds:          z.number().int().min(-10_000).max(10_000),
  units:         z.number().min(0.5).max(100),
  is_vip_only:   z.boolean().optional(),
  game_start_at: z
    .string()
    .datetime({ message: 'Must be a valid ISO 8601 datetime string' })
    .transform(s => new Date(s)),
}).strict();

// Fields that describe the wager itself. Once the game is under way these are
// frozen — see LOCKED_AFTER_START in routes/pickRoutes.ts — so a capper can't
// rewrite a losing bet mid-game. `is_vip_only` is deliberately not in this set:
// paywalling (or un-paywalling) a pick after tip-off changes nothing about the
// wager's record.
export const PICK_WAGER_FIELDS = [
  'sport', 'league', 'game_id', 'bet_type',
  'pick_details', 'odds', 'units', 'game_start_at',
] as const;

export const updatePickBody = z
  .object({
    sport:         z.string().min(1).max(20).optional(),
    league:        z.string().max(20).nullable().optional(),
    game_id:       z.string().min(1).max(60).optional(),
    bet_type:      betTypeEnum.optional(),
    pick_details:  z.record(z.unknown()).optional(),
    odds:          z.number().int().min(-10_000).max(10_000).optional(),
    units:         z.number().min(0.5).max(100).optional(),
    is_vip_only:   z.boolean().optional(),
    game_start_at: z
      .string()
      .datetime({ message: 'Must be a valid ISO 8601 datetime string' })
      .transform(s => new Date(s))
      .optional(),
  })
  .strict()
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const gradePickBody = z
  .object({
    result:       pickResultEnum,
    units_result: z.number().min(-1_000).max(1_000).optional(),
  })
  .strict()
  .refine(data => data.result !== 'pending', {
    message: "Cannot grade a pick as 'pending'",
    path:    ['result'],
  });

export const pickQueryFilters = pagination.extend({
  sport:  z.string().max(20).optional(),
  result: pickResultEnum.optional(),
});

// ── Subscription ───────────────────────────────────────────────────────────
export const createSubscriptionBody = z.object({
  capperId: uuid,
}).strict();

// ── Purchase ───────────────────────────────────────────────────────────────
export const createPurchaseBody = z.object({
  pickId: uuid,
}).strict();

// ── Post ───────────────────────────────────────────────────────────────────
export const createPostBody = z.object({
  title:       z.string().min(1).max(200),
  body:        z.string().min(1).max(50_000),
  sport:       z.string().max(20).optional(),
  league:      z.string().max(20).optional(),
  is_vip_only: z.boolean().optional(),
  pick_id:     uuid.optional(),
}).strict();

export const updatePostBody = createPostBody
  .partial()
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const postQueryFilters = pagination.extend({
  sport:     z.string().max(20).optional(),
  author_id: uuid.optional(),
});

// ── Comment ────────────────────────────────────────────────────────────────
export const createCommentBody = z.object({
  body:              z.string().min(1).max(10_000),
  parent_comment_id: uuid.optional(),
}).strict();

// ── Historical Line ────────────────────────────────────────────────────────
const lineBetTypeEnum = z.enum(['spread', 'moneyline', 'total']);
const lineResultEnum  = z.enum(['home', 'away', 'push']);

export const createLineBody = z.object({
  game_id:          z.string().min(1).max(60),
  sport:            z.string().min(1).max(20),
  home_team:        z.string().min(1).max(60),
  away_team:        z.string().min(1).max(60),
  book:             z.string().min(1).max(30),
  bet_type:         lineBetTypeEnum,
  line_value:       z.number(),
  juice:            z.number().int(),
  final_score_home: z.number().int().optional(),
  final_score_away: z.number().int().optional(),
  result:           lineResultEnum.optional(),
}).strict();

export const updateLineBody = z
  .object({
    final_score_home: z.number().int().optional(),
    final_score_away: z.number().int().optional(),
    result:           lineResultEnum.optional(),
  })
  .strict()
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

// ── Push Token ─────────────────────────────────────────────────────────────
export const pushTokenBody = z.object({
  token:    z.string().min(1).max(500),
  platform: z.enum(['ios', 'android', 'web']),
}).strict();

// ── Admin ──────────────────────────────────────────────────────────────────
export const suspendCapperBody = z.object({
  suspended: z.boolean(),
}).strict();

// ── Odds ───────────────────────────────────────────────────────────────────
export const oddsQuery = z.object({
  sport:   z.string().min(1).max(50),
  regions: z.string().max(50).optional(),
  markets: z.string().max(100).optional(),
});
