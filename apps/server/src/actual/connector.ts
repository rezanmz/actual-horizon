/**
 * Actual Budget service connector.
 *
 * Method names mirror Backend's ActualAdapter (apps/server/src/actualAdapter.ts)
 * so the two converge structurally; Backend keeps its adapter optional-injected
 * until both PRs land, then wires this connector in.
 */

import { defaultActualDeps } from './api.js';
import {
  EXPECTED_ACTUAL_VERSION,
  loadActualConfig,
  type ActualConfig,
  type ActualEnv,
} from './config.js';
import type {
  ActualAccount,
  ActualDeps,
  FlowTransaction,
  MinorToMajor,
  SnapshotPoint,
} from './types.js';

const MAX_DAYS = 365;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validateDays(days: number): number {
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    throw new Error(`Invalid days ${JSON.stringify(days)}: integer 1..${MAX_DAYS}`);
  }
  return days;
}

export function validateIsoDate(value: string, name: string): string {
  if (!ISO_DATE.test(value)) {
    throw new Error(`Invalid ${name} ${JSON.stringify(value)}: expected YYYY-MM-DD`);
  }
  return value;
}

/** YYYY-MM-DD for a Date in UTC. */
export function toISODateUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Oldest-first UTC date list ending today, length `days`. */
export function lastNDatesUTC(days: number, today: Date = new Date()): string[] {
  validateDays(days);
  const end = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    out.push(toISODateUTC(new Date(end - i * 86_400_000)));
  }
  return out;
}

/** End-of-day UTC cutoff for getAccountBalance (inclusive of the whole date). */
export function endOfDayUTC(date: string): Date {
  return new Date(`${validateIsoDate(date, 'date')}T23:59:59.999Z`);
}

export function isOnBudgetAccount(account: ActualAccount): boolean {
  return account.offbudget !== true && account.closed !== true;
}

export class ActualConnector {
  private constructor(
    private readonly config: ActualConfig,
    private readonly deps: ActualDeps,
    private readonly toMajor: MinorToMajor,
  ) {}

  /** Connect: init, download the budget, sync. Shuts down again when setup fails. */
  static async connect(
    env: ActualEnv = process.env,
    deps: ActualDeps = defaultActualDeps,
  ): Promise<ActualConnector> {
    const config = loadActualConfig(env);
    const handle = await deps.init({
      serverURL: config.serverURL,
      password: config.password,
      sessionToken: config.token,
      dataDir: config.dataDir,
    });
    try {
      await deps.downloadBudget(config.budgetId, { password: config.password });
      await deps.sync();
    } catch (err) {
      await deps.shutdown();
      throw err;
    }
    return new ActualConnector(config, deps, handle.integerToAmount);
  }

  /** Pinned-target version when reachable; the probe's version string. */
  async getVersion(): Promise<string> {
    const probe = await this.deps.getServerVersion();
    return 'version' in probe ? probe.version : EXPECTED_ACTUAL_VERSION;
  }

  /** Liveness probe feeding GET /api/health `actual.reachable`. */
  async isReachable(): Promise<boolean> {
    try {
      const probe = await this.deps.getServerVersion();
      return 'version' in probe;
    } catch {
      return false;
    }
  }

  /**
   * Daily closing spot balances (major units), oldest-first, ending today.
   * Sums on-budget open accounts; one balance read per account per day.
   */
  async getDailyBalances(days: number): Promise<SnapshotPoint[]> {
    validateDays(days);
    const accounts = await this.onBudgetAccounts();
    const dates = lastNDatesUTC(days);
    const points: SnapshotPoint[] = [];
    for (const date of dates) {
      const cutoff = endOfDayUTC(date);
      const balances = await Promise.all(
        accounts.map((a) => this.deps.getAccountBalance(a.id, cutoff)),
      );
      let totalMinor = 0;
      for (const b of balances) totalMinor += b;
      points.push({ date, spot: this.toMajor(totalMinor) });
    }
    return points;
  }

  /**
   * Transactions since `sinceIso` (inclusive, major units, date-sorted).
   * Transfer legs are flagged via `transfer_id`; split children are skipped
   * (their parent already carries the full amount).
   */
  async getTransactions(sinceIso: string): Promise<FlowTransaction[]> {
    const since = validateIsoDate(sinceIso, 'sinceIso');
    const end = toISODateUTC(new Date());
    const accounts = await this.onBudgetAccounts();
    const out: FlowTransaction[] = [];
    for (const account of accounts) {
      const rows = await this.deps.getTransactions(account.id, since, end);
      for (const row of rows) {
        if (row.is_child === true) continue;
        if (typeof row.date !== 'string' || typeof row.amount !== 'number') continue;
        out.push({
          date: row.date,
          amount: this.toMajor(row.amount),
          isTransfer: row.transfer_id !== undefined && row.transfer_id !== null,
        });
      }
    }
    out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return out;
  }

  /** Budget currency: budget prefs, else ACTUAL_CURRENCY, else USD. */
  async getCurrency(): Promise<string> {
    const prefs = await this.deps.getPreferences();
    return prefs.defaultCurrencyCode ?? this.config.currency ?? 'USD';
  }

  async shutdown(): Promise<void> {
    await this.deps.shutdown();
  }

  private async onBudgetAccounts(): Promise<ActualAccount[]> {
    const accounts = await this.deps.getAccounts();
    return accounts.filter(isOnBudgetAccount);
  }
}
