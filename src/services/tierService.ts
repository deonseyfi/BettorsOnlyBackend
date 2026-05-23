import pool from '../db/pool';
import { capperProfileDao, capperTierHistoryDao, notificationDao } from '../dao';
import { CapperProfile, CapperTier } from '../types';

const TIER_MIN_WIN_RATE: Record<CapperTier, number> = {
  none:     0,
  bronze:  51,
  silver:  55,
  gold:    60,
  platinum: 65,
};

const TIER_ORDER: CapperTier[] = ['none', 'bronze', 'silver', 'gold', 'platinum'];
const DEMOTION_GRACE_DAYS = 7;
const NEAR_BOUNDARY_PCT   = 2;
const MIN_PICKS_30D       = 20;

export function calculateTargetTier(winRate: number, picksLast30d: number): CapperTier {
  if (picksLast30d < MIN_PICKS_30D) return 'none';
  if (winRate >= TIER_MIN_WIN_RATE.platinum) return 'platinum';
  if (winRate >= TIER_MIN_WIN_RATE.gold)     return 'gold';
  if (winRate >= TIER_MIN_WIN_RATE.silver)   return 'silver';
  if (winRate >= TIER_MIN_WIN_RATE.bronze)   return 'bronze';
  return 'none';
}

function tierRank(tier: CapperTier): number {
  return TIER_ORDER.indexOf(tier);
}

async function notifyActiveSubscribers(
  capperId: string,
  title: string,
  body: string
): Promise<void> {
  const { rows } = await pool.query<{ subscriber_id: string }>(
    `SELECT subscriber_id FROM public.subscriptions WHERE capper_id = $1 AND status = 'active'`,
    [capperId]
  );
  await Promise.all(
    rows.map(r =>
      notificationDao.create({
        user_id:    r.subscriber_id,
        type:       'tier_change',
        title,
        body,
        related_id: capperId,
      })
    )
  );
}

export async function evaluateCapper(capper: CapperProfile): Promise<void> {
  const target      = calculateTargetTier(capper.win_rate_30d, capper.picks_last_30d);
  const currentRank = tierRank(capper.tier);
  const targetRank  = tierRank(target);

  if (targetRank > currentRank) {
    // Promotion — immediate
    await capperProfileDao.update(capper.id, { tier: target, demotion_warning_at: null });
    await capperTierHistoryDao.create({
      capper_id:          capper.id,
      old_tier:           capper.tier,
      new_tier:           target,
      win_rate_at_change: capper.win_rate_30d,
      reason:             'promotion',
    });
    const tierLabel = target.charAt(0).toUpperCase() + target.slice(1);
    await notificationDao.create({
      user_id:    capper.user_id,
      type:       'tier_change',
      title:      `Promoted to ${tierLabel}!`,
      body:       `Your win rate of ${capper.win_rate_30d}% has earned you ${tierLabel} tier.`,
      related_id: capper.id,
    });
    await notifyActiveSubscribers(
      capper.id,
      'Capper tier upgrade',
      `A capper you follow has been promoted to ${tierLabel} tier.`
    );
    return;
  }

  if (targetRank < currentRank) {
    const now = new Date();

    if (!capper.demotion_warning_at) {
      // Issue 7-day warning
      await capperProfileDao.update(capper.id, { demotion_warning_at: now });
      const tierLabel = target.charAt(0).toUpperCase() + target.slice(1);
      await notificationDao.create({
        user_id:    capper.user_id,
        type:       'demotion_warning',
        title:      'Demotion warning',
        body:       `Your win rate has dropped to ${capper.win_rate_30d}%. You will move to ${tierLabel} tier in ${DEMOTION_GRACE_DAYS} days if it doesn't recover.`,
        related_id: capper.id,
      });
    } else {
      const daysElapsed =
        (now.getTime() - new Date(capper.demotion_warning_at).getTime()) / 86_400_000;

      if (daysElapsed >= DEMOTION_GRACE_DAYS) {
        // Execute demotion
        await capperProfileDao.update(capper.id, { tier: target, demotion_warning_at: null });
        await capperTierHistoryDao.create({
          capper_id:          capper.id,
          old_tier:           capper.tier,
          new_tier:           target,
          win_rate_at_change: capper.win_rate_30d,
          reason:             'demotion',
        });
        const tierLabel = target.charAt(0).toUpperCase() + target.slice(1);
        await notificationDao.create({
          user_id:    capper.user_id,
          type:       'tier_change',
          title:      'Tier updated',
          body:       `Your tier has been moved to ${tierLabel} (win rate: ${capper.win_rate_30d}%).`,
          related_id: capper.id,
        });
        await notifyActiveSubscribers(
          capper.id,
          'Capper tier change',
          `A capper you follow has moved to ${tierLabel} tier. Your subscription price will decrease at the next billing cycle.`
        );
      }
    }
    return;
  }

  // Tier unchanged — clear stale demotion warning
  if (capper.demotion_warning_at) {
    await capperProfileDao.update(capper.id, { demotion_warning_at: null });
  }

  // Notify if within 2% of the next tier boundary
  const nextTier = TIER_ORDER[currentRank + 1] as CapperTier | undefined;
  if (nextTier) {
    const gap = TIER_MIN_WIN_RATE[nextTier] - capper.win_rate_30d;
    if (gap > 0 && gap <= NEAR_BOUNDARY_PCT) {
      const nextLabel = nextTier.charAt(0).toUpperCase() + nextTier.slice(1);
      await notificationDao.create({
        user_id:    capper.user_id,
        type:       'streak',
        title:      `Almost ${nextLabel}!`,
        body:       `You're at ${capper.win_rate_30d}% — only ${gap.toFixed(1)}% away from ${nextLabel} tier.`,
        related_id: capper.id,
      });
    }
  }

  // Notify if within 2% of dropping a tier
  if (capper.tier !== 'none' && capper.tier !== 'bronze') {
    const dropGap = capper.win_rate_30d - TIER_MIN_WIN_RATE[capper.tier];
    if (dropGap >= 0 && dropGap <= NEAR_BOUNDARY_PCT) {
      await notificationDao.create({
        user_id:    capper.user_id,
        type:       'demotion_warning',
        title:      'Keep it up!',
        body:       `Your win rate is ${capper.win_rate_30d}% — only ${dropGap.toFixed(1)}% above the ${capper.tier} threshold.`,
        related_id: capper.id,
      });
    }
  }
}

export async function evaluateAllCappers(): Promise<{ evaluated: number; errors: number }> {
  const cappers = await capperProfileDao.list({ is_suspended: false });
  let errors = 0;

  await Promise.allSettled(
    cappers.map(async capper => {
      try {
        await evaluateCapper(capper);
      } catch {
        errors++;
      }
    })
  );

  return { evaluated: cappers.length, errors };
}
