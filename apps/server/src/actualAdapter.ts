/**
 * Type-only boundary to the Actual Budget sidecar.
 *
 * Owned by the Auth agent (`src/auth/**`, `src/actual/**`): they provide the
 * implementation against `@actual-app/api`. Backend code (routes, snapshots
 * job) depends ONLY on this interface — never on a concrete implementation.
 * No Actual connection code may live outside `src/auth/**` / `src/actual/**`.
 */

export interface DailyBalance {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** Net-worth spot balance in currency units. */
  spot: number;
}

export interface FlowRecord {
  /** ISO date (YYYY-MM-DD) of the transaction. */
  date: string;
  /** Signed amount: +inflow, -outflow, in currency units. */
  amount: number;
  /** True for account-to-account transfers (excluded from rate by default). */
  isTransfer: boolean;
}

export interface ActualAdapter {
  /** Actual Budget version string, e.g. "26.9.0". */
  getVersion(): Promise<string>;
  /** False when the sidecar is unreachable — callers must degrade, not throw. */
  isReachable(): Promise<boolean>;
  /** Daily spot balances, oldest-first, up to `days` entries. */
  getDailyBalances(days: number): Promise<DailyBalance[]>;
  /** Signed transactions on/after `sinceIso` (YYYY-MM-DD), oldest-first. */
  getTransactions(sinceIso: string): Promise<FlowRecord[]>;
  /** ISO 4217 currency code, e.g. "USD". */
  getCurrency(): Promise<string>;
}
