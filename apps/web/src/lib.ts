import type { Goal, Impact, MetaEntry, Settings, Snapshot, Stats, Wish, WishStatus } from "./types";

/** Wishes still awaiting a decision belong in the queue with a visible impact. */
export const UNDECIDED_STATUSES: WishStatus[] = ["inbox", "cooling", "ready"];

/** Pure helpers mirroring the frozen contract math (client-side display only). */

export function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${Math.round(value)}`;
  }
}

/** days_to_goal = (target - avg) / rate waterfall; null when rate <= 0 (drifting). */
export function daysToGoal(target: number, avg: number, rate: number): number | null {
  if (rate <= 0) return null;
  return Math.max(0, Math.ceil((target - avg) / rate));
}

export function projectDate(days: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** delay = price / rate; null when rate <= 0. */
export function delayDays(price: number, rate: number): number | null {
  if (rate <= 0) return null;
  return Math.ceil(price / rate);
}

export function cooldownRemainingMs(cooldownUntil: string | undefined, now: number): number | null {
  if (!cooldownUntil) return null;
  return new Date(cooldownUntil).getTime() - now;
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return "ready now";
  // cooldownUntil is a calendar date (midnight), so a fresh 7-day timer reads
  // 6d 4h at best. Ceil to whole days: the rule counts days, not midnights.
  if (ms >= 86_400_000) return `${Math.ceil(ms / 86_400_000)}d`;
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
/** Chart timeframes driving /api/snapshots?days=. */
export const TIMEFRAMES = [
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
  { days: 180, label: "6m" },
  { days: 365, label: "1y" },
] as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Adaptive x label: day precision on short ranges, month + year once buckets go monthly. */
export function formatXLabel(iso: string, spanDays: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  if (spanDays > 200) return `${MONTHS[m - 1]} ’${String(y).slice(2)}`;
  return `${MONTHS[m - 1]} ${d}`;
}

/**
 * Downsample daily snapshots for long ranges so a 560px chart stays readable:
 * daily ≤62 points, weekly ≤200d, monthly beyond. Spot = bucket close,
 * avg/rate = bucket means (rate ignores nulls).
 */
export function bucketSnapshots(snapshots: Snapshot[], spanDays: number): Snapshot[] {
  if (snapshots.length === 0) return [];
  const width = spanDays <= 62 ? 1 : spanDays <= 200 ? 7 : -1;
  if (width === 1) return snapshots;
  const buckets: Snapshot[][] = [];
  if (width === -1) {
    let cur: Snapshot[] = [];
    let key = "";
    for (const s of snapshots) {
      const k = s.date.slice(0, 7);
      if (k !== key) {
        if (cur.length > 0) buckets.push(cur);
        cur = [];
        key = k;
      }
      cur.push(s);
    }
    if (cur.length > 0) buckets.push(cur);
  } else {
    for (let i = 0; i < snapshots.length; i += width) buckets.push(snapshots.slice(i, i + width));
  }
  return buckets.map((b) => {
    const rates = b.map((s) => s.rate).filter((r): r is number => r !== null);
    return {
      date: b[0].date,
      spot: b[b.length - 1].spot,
      avg: b.reduce((a, s) => a + s.avg, 0) / b.length,
      rate: rates.length > 0 ? rates.reduce((a, r) => a + r, 0) / rates.length : null,
    };
  });
}

export function maxDelay(impact: Impact | undefined): number | null {
  if (!impact || impact.perGoal.length === 0) return null;
  return Math.max(...impact.perGoal.map((p) => p.delayDays));
}
/** Fixture data matching the contract shapes; used by the smoke test and local dev. */
export const fixtureStats: Stats = {
  spot: 12400,
  avg30: 11800,
  ratePerDay: 42,
  currency: "USD",
  inflowPerDay: 210,
  outflowPerDay: 168,
  windowDays: 180,
  txCount: 412,
};

export const fixtureSnapshots: Snapshot[] = Array.from({ length: 30 }, (_, i) => {
  const date = new Date(Date.UTC(2026, 7, 7 + i)).toISOString().slice(0, 10);
  return {
    date,
    spot: 10000 + i * 80,
    avg: 9800 + i * 70,
    rate: 35 + (i % 5),
  };
});

export const fixtureGoals: Goal[] = [
  { id: "g1", name: "Emergency fund", target: 15000, priority: 1 },
  { id: "g2", name: "Bike", target: 2000, priority: 2, deadline: "2026-12-01" },
];

export const fixtureWishes: Wish[] = [
  {
    id: "w1",
    name: "Headphones",
    price: 349,
    cadence: "one-off",
    status: "cooling",
    addedAt: "2026-08-20T00:00:00.000Z",
    cooldownUntil: new Date(Date.now() + 6 * 86400000).toISOString(),
    linkedGoalId: "g2",
  },
  {
    id: "w2",
    name: "Coffee subscription",
    price: 18,
    cadence: "monthly",
    status: "inbox",
    addedAt: "2026-09-01T00:00:00.000Z",
  },
];

export const fixtureImpacts: Record<string, Impact> = {
  w1: {
    perGoal: [
      { goalId: "g1", oldDate: "2026-11-10", newDate: "2026-11-18", delayDays: 8 },
      { goalId: "g2", oldDate: "2026-09-20", newDate: "2026-09-28", delayDays: 8 },
    ],
    neverGoals: [],
  },
};

/** Frozen contract #18: default settings shape (GET /api/settings). */
export const fixtureSettings: Settings = {
  lookbackDays: 180,
  excludedAccounts: [],
  excludedCategories: [],
  cooldownRules: [
    { maxPrice: 50, days: 3 },
    { maxPrice: 500, days: 7 },
    { maxPrice: null, days: 30 },
  ],
  currency: "USD",
};

export const fixtureAccounts: MetaEntry[] = [
  { id: "ac1", name: "Everyday checking" },
  { id: "ac2", name: "Rainy-day savings" },
  { id: "ac3", name: "Brokerage" },
];

export const fixtureCategories: MetaEntry[] = [
  { id: "ct1", name: "Groceries" },
  { id: "ct2", name: "Transfers" },
  { id: "ct3", name: "Dining out" },
];
