import type { Cadence, Goal, Wish } from './types.js';

/** Reference Actual version this backend is built against. */
export const ACTUAL_VERSION = '26.9.0';

/** Period length in days for each recurring cadence. */
const PERIOD_DAYS: Record<Exclude<Cadence, 'one-off'>, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/**
 * 30-day average of daily spot balances (mean of the trailing 30 entries,
 * or fewer when less history exists). Contract: avg30=mean(daily spot,30d).
 */
export function avg30(dailySpots: readonly number[]): number {
  return mean(dailySpots.slice(-30));
}

/**
 * Savings rate per day. Contract: rate=(inflows-outflows)/days,
 * transfers excluded by default (see rateFromTransactions).
 */
export function savingsRate(inflows: number, outflows: number, days: number): number {
  if (!Number.isFinite(inflows) || !Number.isFinite(outflows)) return 0;
  if (!(days > 0)) return 0;
  return (inflows - outflows) / days;
}

export interface FlowTransaction {
  /** Signed amount: +inflow, -outflow. */
  amount: number;
  isTransfer?: boolean;
}

/** Net flow per day from signed transactions. */
export function rateFromTransactions(
  txs: readonly FlowTransaction[],
  days: number,
  excludeTransfers = true,
): number {
  if (!(days > 0)) return 0;
  let net = 0;
  for (const tx of txs) {
    if (excludeTransfers && tx.isTransfer) continue;
    net += tx.amount;
  }
  return net / days;
}

/** Days from `avg` to reach `target` at `rate`/day, or null when drifting. */
export function daysToGoal(target: number, avg: number, rate: number): number | null {
  if (!(rate > 0)) return null;
  const days = (target - avg) / rate;
  return days <= 0 ? 0 : days;
}

export type GoalDateStatus = 'funded' | 'on-track' | 'drifting';

export interface GoalProjection {
  goalId: string;
  /** Fractional days from today; null when drifting. */
  days: number | null;
  /** ISO date (YYYY-MM-DD); null when drifting. */
  date: string | null;
  status: GoalDateStatus;
}

export function todayIsoUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Whole calendar days from today; rounds fractional days up. */
export function addDaysIso(todayIso: string, days: number): string {
  const ms = Date.parse(`${todayIso}T00:00:00.000Z`);
  const out = new Date(ms + Math.ceil(days) * 86_400_000);
  return out.toISOString().slice(0, 10);
}

/**
 * Waterfall projection: goals fund in priority order (lowest first), so each
 * goal's date accounts for the targets ahead of it (cumulative funding need).
 * rate<=0 → every goal drifting (null date).
 */
export function projectWaterfall(
  goals: readonly Goal[],
  avg: number,
  rate: number,
  todayIso: string = todayIsoUtc(),
): GoalProjection[] {
  const ordered = [...goals].sort((a, b) => a.priority - b.priority);
  if (!(rate > 0)) {
    return ordered.map((g) => ({ goalId: g.id, days: null, date: null, status: 'drifting' }));
  }
  let cumulative = 0;
  return ordered.map((g) => {
    cumulative += g.target;
    const days = daysToGoal(cumulative, avg, rate);
    if (days === null) return { goalId: g.id, days: null, date: null, status: 'drifting' as const };
    return {
      goalId: g.id,
      days,
      date: addDaysIso(todayIso, days),
      status: days === 0 ? ('funded' as const) : ('on-track' as const),
    };
  });
}

/** Daily cost of a wish: 0 for one-off, price/periodDays for recurring. */
export function dailyCostOf(wish: Pick<Wish, 'price' | 'cadence'>): number {
  if (wish.cadence === 'one-off') return 0;
  return wish.price / PERIOD_DAYS[wish.cadence];
}

export interface ImpactPerGoal {
  goalId: string;
  oldDate: string | null;
  newDate: string | null;
  /** Extra days the goal is delayed; null when unprojectable. */
  delayDays: number | null;
}

export interface ImpactResult {
  perGoal: ImpactPerGoal[];
  neverGoals: string[];
}

/**
 * Impact of buying/starting a wish on goal dates. Contract:
 * - one-off: balance drops by price → delay=price/rate per goal.
 * - recurring: effective rate' = rate - daily_cost; rate'<=0 → never.
 * - rate<=0 → drifting (null dates, empty neverGoals).
 */
export function impactOfWish(
  wish: Pick<Wish, 'price' | 'cadence'>,
  goals: readonly Goal[],
  avg: number,
  rate: number,
  todayIso: string = todayIsoUtc(),
): ImpactResult {
  const ordered = [...goals].sort((a, b) => a.priority - b.priority);
  const old = projectWaterfall(ordered, avg, rate, todayIso);
  const drifted: ImpactResult = {
    perGoal: old.map((p) => ({ goalId: p.goalId, oldDate: null, newDate: null, delayDays: null })),
    neverGoals: [],
  };
  if (!(rate > 0)) return drifted;

  if (wish.cadence === 'one-off') {
    const projected = projectWaterfall(ordered, avg - wish.price, rate, todayIso);
    const delayDays = wish.price / rate;
    return {
      perGoal: old.map((p, i) => ({
        goalId: p.goalId,
        oldDate: p.date,
        newDate: projected[i]?.date ?? null,
        delayDays,
      })),
      neverGoals: [],
    };
  }

  const effectiveRate = rate - dailyCostOf(wish);
  if (!(effectiveRate > 0)) {
    return {
      perGoal: old.map((p) => ({
        goalId: p.goalId,
        oldDate: p.date,
        newDate: null,
        delayDays: null,
      })),
      neverGoals: ordered.map((g) => g.id),
    };
  }
  const projected = projectWaterfall(ordered, avg, effectiveRate, todayIso);
  return {
    perGoal: old.map((p, i) => {
      const next = projected[i];
      const delayDays =
        p.days !== null && next != null && next.days !== null ? next.days - p.days : null;
      return {
        goalId: p.goalId,
        oldDate: p.date,
        newDate: next?.date ?? null,
        delayDays,
      };
    }),
    neverGoals: [],
  };
}
