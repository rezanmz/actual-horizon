/** Shared domain types for the API backend (frozen Contract shapes). */

export interface Goal {
  id: string;
  name: string;
  /** Funding target in currency units. Must be > 0. */
  target: number;
  /** Lower funds first in waterfall projections. */
  priority: number;
  /** Optional ISO date (YYYY-MM-DD). */
  deadline?: string | null;
}

export type Cadence = 'one-off' | 'daily' | 'weekly' | 'monthly';

export type WishStatus = 'inbox' | 'cooling' | 'ready' | 'bought' | 'rejected';

export interface Wish {
  id: string;
  name: string;
  /** Price in currency units. Must be >= 0. */
  price: number;
  cadence: Cadence;
  status: WishStatus;
  /** ISO timestamp of when the wish was added. */
  addedAt: string;
  /** ISO timestamp until which the wish is cooling down. */
  cooldownUntil?: string | null;
  linkedGoalId?: string | null;
  url?: string | null;
  notes?: string | null;
}
