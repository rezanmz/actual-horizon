export interface Health {
  ok: boolean;
  actual: { version: string; reachable: boolean };
}

export interface Stats {
  spot: number;
  avg30: number;
  ratePerDay: number;
  currency: string;
  /** Additive honesty fields (frozen contract #18): present once the backend lands. */
  inflowPerDay?: number;
  outflowPerDay?: number;
  windowDays?: number;
  txCount?: number;
}

export interface Snapshot {
  date: string;
  spot: number;
  avg: number;
  rate: number | null;
}

export interface Goal {
  id: string;
  name: string;
  target: number;
  priority: number;
  deadline?: string;
}

export type WishCadence = "one-off" | "daily" | "weekly" | "monthly";
export type WishStatus = "inbox" | "cooling" | "ready" | "bought" | "rejected";

export interface Wish {
  id: string;
  name: string;
  price: number;
  cadence: WishCadence;
  status: WishStatus;
  addedAt: string;
  cooldownUntil?: string;
  linkedGoalId?: string;
  url?: string;
  notes?: string;
}

export interface ImpactGoal {
  goalId: string;
  oldDate: string | null;
  newDate: string | null;
  delayDays: number;
}

export interface Impact {
  perGoal: ImpactGoal[];
  neverGoals: string[];
}

/** Frozen contract #18: ledger settings. */
export interface CooldownRule {
  maxPrice: number | null;
  days: number;
}

export interface Settings {
  lookbackDays: number;
  excludedAccounts: string[];
  excludedCategories: string[];
  cooldownRules: CooldownRule[];
  currency: string;
}

export interface MetaEntry {
  id: string;
  name: string;
}
