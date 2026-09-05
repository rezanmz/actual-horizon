export interface Health {
  ok: boolean;
  actual: { version: string; reachable: boolean };
}

export interface Stats {
  spot: number;
  avg30: number;
  ratePerDay: number;
  currency: string;
}

export interface Snapshot {
  date: string;
  spot: number;
  avg: number;
  rate: number;
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
