import { describe, expect, it } from 'vitest';

import { loadActualConfig, redactConfig } from './config.js';
import {
  ActualConnector,
  endOfDayUTC,
  isOnBudgetAccount,
  lastNDatesUTC,
  toISODateUTC,
  validateDays,
  validateIsoDate,
} from './connector.js';
import type { ActualDeps } from './types.js';

const ENV = {
  ACTUAL_SERVER_URL: 'https://budget.example.com/',
  ACTUAL_BUDGET_ID: 'budget-1',
  ACTUAL_PASSWORD: 'secret',
};

function fakeDeps(overrides: Partial<ActualDeps> = {}): ActualDeps {
  return {
    init: async () => ({ integerToAmount: (minor: number) => minor / 100 }),
    downloadBudget: async () => {},
    sync: async () => {},
    getAccounts: async () => [
      { id: 'a1', name: 'Checking' },
      { id: 'a2', name: 'Savings' },
      { id: 'a3', name: 'Credit', offbudget: true },
      { id: 'a4', name: 'Closed', closed: true },
    ],
    getAccountBalance: async (id: string) => (id === 'a1' ? 100_00 : 50_00),
    getTransactions: async () => [],
    getServerVersion: async () => ({ version: '26.9.0' }),
    getPreferences: async () => ({}),
    shutdown: async () => {},
    ...overrides,
  };
}

describe('loadActualConfig', () => {
  it('loads and trims trailing slashes', () => {
    const config = loadActualConfig(ENV);
    expect(config.serverURL).toBe('https://budget.example.com');
    expect(config.budgetId).toBe('budget-1');
  });

  it('accepts a token without a password', () => {
    const config = loadActualConfig({
      ACTUAL_SERVER_URL: 'http://localhost:5006',
      ACTUAL_BUDGET_ID: 'b',
      ACTUAL_TOKEN: 'tok',
    });
    expect(config.password).toBeUndefined();
    expect(config.token).toBe('tok');
  });

  it('requires url, budget, and a credential', () => {
    expect(() => loadActualConfig({ ...ENV, ACTUAL_SERVER_URL: '' })).toThrow(/ACTUAL_SERVER_URL/);
    expect(() => loadActualConfig({ ...ENV, ACTUAL_BUDGET_ID: '' })).toThrow(/ACTUAL_BUDGET_ID/);
    expect(() => loadActualConfig({ ...ENV, ACTUAL_PASSWORD: '' })).toThrow(/credential/);
    expect(() => loadActualConfig({ ...ENV, ACTUAL_SERVER_URL: 'http://budget.example.com' })).toThrow(/https/);
  });

  it('redacts secrets', () => {
    const redacted = redactConfig(loadActualConfig(ENV));
    expect(JSON.stringify(redacted)).not.toContain('secret');
    expect(redacted['password']).toBe('(set)');
  });
});

describe('date helpers', () => {
  it('lists oldest-first UTC dates ending today', () => {
    const dates = lastNDatesUTC(3, new Date('2026-09-05T12:00:00Z'));
    expect(dates).toEqual(['2026-09-03', '2026-09-04', '2026-09-05']);
    expect(toISODateUTC(new Date('2026-09-05T00:00:00Z'))).toBe('2026-09-05');
  });

  it('validates ranges and formats', () => {
    expect(() => validateDays(0)).toThrow(/days/);
    expect(() => validateDays(366)).toThrow(/days/);
    expect(() => validateIsoDate('05-09-2026', 'sinceIso')).toThrow(/YYYY-MM-DD/);
    expect(endOfDayUTC('2026-09-05').toISOString()).toBe('2026-09-05T23:59:59.999Z');
  });

  it('keeps only open on-budget accounts', () => {
    expect(isOnBudgetAccount({ id: 'x' })).toBe(true);
    expect(isOnBudgetAccount({ id: 'x', offbudget: true })).toBe(false);
    expect(isOnBudgetAccount({ id: 'x', closed: true })).toBe(false);
  });
});

describe('ActualConnector', () => {
  it('reports version and reachability from the probe', async () => {
    const ok = await ActualConnector.connect(ENV, fakeDeps());
    expect(await ok.getVersion()).toBe('26.9.0');
    expect(await ok.isReachable()).toBe(true);

    const failing = await ActualConnector.connect(
      ENV,
      fakeDeps({ getServerVersion: async () => ({ error: 'network-failure' }) }),
    );
    expect(await failing.isReachable()).toBe(false);
    expect(await failing.getVersion()).toBe('26.9.0');

    const throwing = await ActualConnector.connect(
      ENV,
      fakeDeps({
        getServerVersion: async () => {
          throw new Error('down');
        },
      }),
    );
    expect(await throwing.isReachable()).toBe(false);
  });

  it('sums on-budget balances into major-unit spots, oldest-first', async () => {
    const seen: string[] = [];
    const connector = await ActualConnector.connect(
      ENV,
      fakeDeps({
        getAccountBalance: async (id: string, cutoff: Date) => {
          seen.push(`${id}@${cutoff.toISOString().slice(0, 10)}`);
          return id === 'a1' ? 100_00 : 50_00;
        },
      }),
    );
    const points = await connector.getDailyBalances(2);
    for (const p of points) expect(p.spot).toBe(150);
    expect(seen.every((s) => s.startsWith('a1@') || s.startsWith('a2@'))).toBe(true);
    expect(seen.some((s) => s.startsWith('a3@') || s.startsWith('a4@'))).toBe(false);
  });

  it('maps transactions with transfer flags, skipping split children', async () => {
    const connector = await ActualConnector.connect(
      ENV,
      fakeDeps({
        getTransactions: async () => [
          { date: '2026-09-02', amount: -500 },
          { date: '2026-09-01', amount: -200, transfer_id: 't1' },
          { date: '2026-09-01', amount: -100, is_child: true },
        ],
      }),
    );
    const rows = await connector.getTransactions('2026-09-01');
    expect(rows).toHaveLength(4);
    expect(rows[0]?.date).toBe('2026-09-01');
    expect(rows.map((r) => r.isTransfer)).toEqual([true, true, false, false]);
    expect(rows[0]?.amount).toBe(-2);
  });

  it('resolves currency from prefs, env, then USD', async () => {
    const fromPrefs = await ActualConnector.connect(
      ENV,
      fakeDeps({ getPreferences: async () => ({ defaultCurrencyCode: 'EUR' }) }),
    );
    expect(await fromPrefs.getCurrency()).toBe('EUR');

    const fromEnv = await ActualConnector.connect(
      { ...ENV, ACTUAL_CURRENCY: 'GBP' },
      fakeDeps(),
    );
    expect(await fromEnv.getCurrency()).toBe('GBP');

    const fallback = await ActualConnector.connect(ENV, fakeDeps());
    expect(await fallback.getCurrency()).toBe('USD');
  });

  it('shuts down after failed setup', async () => {
    let shutdowns = 0;
    await expect(
      ActualConnector.connect(
        ENV,
        fakeDeps({
          downloadBudget: async () => {
            throw new Error('bad password');
          },
          shutdown: async () => {
            shutdowns += 1;
          },
        }),
      ),
    ).rejects.toThrow(/bad password/);
    expect(shutdowns).toBe(1);
  });
});
