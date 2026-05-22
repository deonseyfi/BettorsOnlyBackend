export type UserRole = 'user' | 'capper' | 'admin';
export type CapperTier = 'none' | 'bronze' | 'silver' | 'gold' | 'platinum';
export type TierChangeReason = 'promotion' | 'demotion' | 'manual';
export type BetType = 'spread' | 'moneyline' | 'total' | 'prop' | 'parlay';
export type PickResult = 'pending' | 'win' | 'loss' | 'push' | 'void';
export type SubscriptionStatus = 'active' | 'cancelled' | 'past_due' | 'expired';
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded';
export type NotificationType = 'new_pick' | 'tier_change' | 'streak' | 'demotion_warning' | 'sub_price_change';
export type PushPlatform = 'ios' | 'android' | 'web';
export type AccessType = 'subscription' | 'single_purchase' | 'free';
export type LineResult = 'home' | 'away' | 'push';
export type LineBetType = 'spread' | 'moneyline' | 'total';

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  is_verified: boolean;
  is_capper: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CapperProfile {
  id: string;
  user_id: string;
  tier: CapperTier;
  win_rate_30d: number;
  roi_30d: number;
  units_profit_30d: number;
  total_picks: number;
  picks_last_30d: number;
  current_streak: number;
  monthly_price_cents: number;
  single_pick_price_cents: number;
  bio: string | null;
  demotion_warning_at: Date | null;
  last_pick_at: Date | null;
  is_suspended: boolean;
  updated_at: Date;
}

export interface CapperTierHistory {
  id: string;
  capper_id: string;
  old_tier: CapperTier;
  new_tier: CapperTier;
  win_rate_at_change: number;
  reason: TierChangeReason;
  changed_at: Date;
}

// Named BetPick to avoid collision with TypeScript's built-in Pick<T,K> utility
export interface BetPick {
  id: string;
  capper_id: string;
  sport: string;
  league: string | null;
  game_id: string;
  bet_type: BetType;
  pick_details: Record<string, unknown>;
  odds: number;
  units: number;
  is_vip_only: boolean;
  result: PickResult;
  units_result: number | null;
  graded_at: Date | null;
  game_start_at: Date;
  created_at: Date;
}

export interface PickAccessLog {
  id: string;
  pick_id: string;
  user_id: string;
  access_type: AccessType;
  accessed_at: Date;
}

export interface Subscription {
  id: string;
  subscriber_id: string;
  capper_id: string;
  status: SubscriptionStatus;
  tier_at_subscribe: CapperTier;
  price_cents: number;
  stripe_subscription_id: string | null;
  current_period_start: Date;
  current_period_end: Date;
  cancelled_at: Date | null;
  created_at: Date;
}

export interface SinglePickPurchase {
  id: string;
  user_id: string;
  pick_id: string;
  amount_cents: number;
  stripe_payment_intent_id: string | null;
  status: PaymentStatus;
  purchased_at: Date;
}

export interface Post {
  id: string;
  author_id: string;
  sport: string | null;
  league: string | null;
  title: string;
  body: string;
  is_vip_only: boolean;
  pick_id: string | null;
  upvotes: number;
  created_at: Date;
  updated_at: Date;
}

// Named BetComment to avoid potential collision with DOM Comment type
export interface BetComment {
  id: string;
  post_id: string;
  author_id: string;
  parent_comment_id: string | null;
  body: string;
  created_at: Date;
}

export interface HistoricalLine {
  id: string;
  game_id: string;
  sport: string;
  home_team: string;
  away_team: string;
  book: string;
  bet_type: LineBetType;
  line_value: number;
  juice: number;
  final_score_home: number | null;
  final_score_away: number | null;
  result: LineResult | null;
  recorded_at: Date;
}

// Named AppNotification to avoid collision with DOM Notification type
export interface AppNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  related_id: string | null;
  is_read: boolean;
  created_at: Date;
}

export interface PushToken {
  id: string;
  user_id: string;
  token: string;
  platform: PushPlatform;
  created_at: Date;
}

export interface LeaderboardEntry {
  capper_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  tier: CapperTier;
  win_rate_30d: number;
  roi_30d: number;
  units_profit_30d: number;
  total_picks: number;
  current_streak: number;
  monthly_price_cents: number;
}
