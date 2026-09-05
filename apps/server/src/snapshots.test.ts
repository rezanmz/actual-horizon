import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ActualAdapter, FlowRecord } from './actualAdapter.js';
import { initDb, setSetting } from './db.js';
import { addDaysIso } from './math.js';
import { appendDailySnapshot, backfillSnapshots, trailingRate } from './snapshots.js';

const TODAY = '2026-09-05';

function memDb(): Database.Database {
  const db = new Database(':memory:');
  initDb(db);
  return db;
}

/** Fake adapter: flat `net` per day across every tx, balances at a fixed spot. */
function fakeAdapter(dailyNet: number, spot = 1000, txAccount = 'a1'): ActualAdapter {
  const flows: FlowRecord[] = [];
  return {
    getVersion: async () => '26.9.0',
    isReachable: async () => true,
    getDailyBalances: async (days: number) => {
      const dates: { date: string; spot: number }[] = [];
      for (let i = days - 1; i >= 0; i -= 1) dates.push({ date: addDaysIso(TODAY, -i), spot });
      return dates;
    },
    getTransactions: async (sinceIso: string) => {
      const out: FlowRecord[] = [];
      let day = sinceIso;
      while (day <= TODAY) {
        out.push({ date: day, amount: dailyNet, isTransfer: false, accountId: txAccount, categoryId: null });
        day = addDaysIso(day, 1);
      }
      return out;
    },
    getCurrency: async () => 'USD',
    getAccounts: async () => [{ id: 'a1', name: 'Checking', offBudget: false }],
    getCategories: async () => [],
  };
}

describe('trailingRate', () => {
  it('nets exactly the lookback window ending that day', () => {
    const flows: FlowRecord[] = [
      { date: '2026-09-05', amount: 300, isTransfer: false, accountId: 'a1', categoryId: null },
      { date: '2026-08-01', amount: 100, isTransfer: false, accountId: 'a1', categoryId: null },
      { date: '2026-09-04', amount: 1000, isTransfer: true, accountId: 'a1', categoryId: null },
    ];
    // 30d window ending 09-05 starts 08-07: the 08-01 flow and transfer are out.
    expect(trailingRate(flows, '2026-09-05', 30)).toBe(10);
    expect(trailingRate(flows, '2026-08-01', 30)).toBeCloseTo(100 / 30);
  });
});

describe('appendDailySnapshot', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = memDb();
  });

  it('computes the rate over the 180d default, not 30d', async () => {
    const point = await appendDailySnapshot(db, fakeAdapter(30), TODAY);
    // 30/day × 180 days / 180 = 30. A hardcoded 30d window would agree here…
    expect(point?.rate).toBe(30);
    // …so prove the window: 30/day stopped 60 days ago → 180d nets 10/day.
    const gappy: ActualAdapter = {
      ...fakeAdapter(30),
      getTransactions: async (sinceIso: string) => {
        const all = await fakeAdapter(30).getTransactions(sinceIso);
        return all.filter((t) => t.date > addDaysIso(TODAY, -60));
      },
    };
    const db2 = memDb();
    const p2 = await appendDailySnapshot(db2, gappy, TODAY);
    expect(p2?.rate).toBeCloseTo((30 * 60) / 180);
  });

  it('reads lookbackDays from settings and filters exclusions first', async () => {
    setSetting(db, 'lookbackDays', '10');
    setSetting(db, 'excludedCategories', JSON.stringify(['c9']));
    const adapter: ActualAdapter = {
      ...fakeAdapter(10),
      getTransactions: async (sinceIso: string) => [
        ...(await fakeAdapter(10).getTransactions(sinceIso)),
        { date: TODAY, amount: 10_000, isTransfer: false, accountId: 'a1', categoryId: 'c9' },
      ],
    };
    const point = await appendDailySnapshot(db, adapter, TODAY);
    // Excluded 10k would swamp the 10/day baseline if it leaked into math.
    expect(point?.rate).toBe(10);
  });

  it('returns null without writing when unreachable', async () => {
    const down: ActualAdapter = {
      ...fakeAdapter(10),
      getDailyBalances: async () => {
        throw new Error('down');
      },
    };
    expect(await appendDailySnapshot(memDb(), down, TODAY)).toBeNull();
  });
});

describe('backfillSnapshots', () => {
  it('stores a non-null rolling rate for every backfilled day', async () => {
    const db = memDb();
    const points = await backfillSnapshots(db, fakeAdapter(20), 90, {}, TODAY);
    expect(points).toHaveLength(90);
    expect(points.every((p) => p.rate !== null)).toBe(true);
    // Flat 20/day in, no outflows: every trailing window nets exactly 20/day.
    for (const p of points) expect(p.rate).toBe(20);
  });

  it('makes a single transaction fetch covering window + history', async () => {
    const db = memDb();
    const seen: string[] = [];
    const adapter: ActualAdapter = {
      ...fakeAdapter(5),
      getTransactions: async (sinceIso: string) => {
        seen.push(sinceIso);
        return fakeAdapter(5).getTransactions(sinceIso);
      },
    };
    await backfillSnapshots(db, adapter, 90, { lookbackDays: 180 }, TODAY);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(addDaysIso(TODAY, -(180 + 90)));
  });

  it('moves the stored rates when exclusions change', async () => {
    const base = fakeAdapter(10);
    const adapter: ActualAdapter = {
      ...base,
      getTransactions: async (sinceIso: string) => {
        const extra: FlowRecord[] = [];
        for (let i = 0; i < 300; i += 1) {
          const date = addDaysIso(TODAY, -i);
          if (date >= sinceIso) {
            extra.push({ date, amount: 1000, isTransfer: false, accountId: 'a1', categoryId: 'c9' });
          }
        }
        return [...(await base.getTransactions(sinceIso)), ...extra];
      },
    };
    const plain = await backfillSnapshots(memDb(), adapter, 10, {}, TODAY);
    const filtered = await backfillSnapshots(memDb(), adapter, 10, { excludedCategories: ['c9'] }, TODAY);
    expect(plain[0]?.rate).toBe(1010);
    expect(filtered[0]?.rate).toBe(10);
  });
});
