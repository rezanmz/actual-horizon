import type Database from 'better-sqlite3';
import DatabaseImpl from 'better-sqlite3';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ActualAdapter } from './actualAdapter.js';
import { initDb } from './db.js';
import { createApp } from './index.js';

const DOWN: ActualAdapter = {
  getVersion: async () => '26.9.0',
  isReachable: async () => false,
  getDailyBalances: async () => {
    throw new Error('down');
  },
  getTransactions: async () => {
    throw new Error('down');
  },
  getCurrency: async () => {
    throw new Error('down');
  },
  getAccounts: async () => {
    throw new Error('down');
  },
  getCategories: async () => {
    throw new Error('down');
  },
};

const LIVE: ActualAdapter = {
  ...DOWN,
  isReachable: async () => true,
  getDailyBalances: async () => [{ date: '2026-09-05', spot: 9000 }],
  getTransactions: async () => [
    { date: '2026-09-05', amount: 200, isTransfer: false, accountId: 'a1', categoryId: null },
    { date: '2026-09-04', amount: -80, isTransfer: false, accountId: 'a1', categoryId: null },
    { date: '2026-09-03', amount: 500, isTransfer: true, accountId: 'a1', categoryId: null },
  ],
  getCurrency: async () => 'EUR',
  getAccounts: async () => [{ id: 'a1', name: 'Checking', offBudget: false }],
  getCategories: async () => [{ id: 'c1', name: 'Groceries' }],
};

let servers: { close(): void }[] = [];
afterEach(() => {
  for (const s of servers) s.close();
  servers = [];
});

async function serve(db: Database.Database, adapter?: ActualAdapter): Promise<string> {
  const app = createApp({ db, adapter, skipStatic: true });
  const server = await new Promise<{ close(): void; port: number }>((resolve) => {
    const s = app.listen(0, () => {
      servers.push(s);
      resolve({ close: () => s.close(), port: (s.address() as AddressInfo).port });
    });
  });
  return `http://127.0.0.1:${server.port}`;
}

async function json(url: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  return { status: res.status, body: (await res.json()) as unknown };
}

function memDb(): Database.Database {
  const db = new DatabaseImpl(':memory:');
  initDb(db);
  return db;
}

describe('settings API', () => {
  let base = '';
  beforeEach(async () => {
    base = await serve(memDb());
  });

  it('GET serves the default shape', async () => {
    const { status, body } = await json(`${base}/api/settings`);
    expect(status).toBe(200);
    expect(body).toEqual({
      lookbackDays: 180,
      excludedAccounts: [],
      excludedCategories: [],
      cooldownRules: [
        { maxPrice: 50, days: 3 },
        { maxPrice: 500, days: 7 },
        { maxPrice: null, days: 30 },
      ],
      currency: 'USD',
    });
  });

  it('PUT merges partial bodies and rejects bad windows', async () => {
    const ok = await json(`${base}/api/settings`, {
      method: 'PUT',
      body: JSON.stringify({ lookbackDays: 90, currency: 'EUR' }),
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ lookbackDays: 90, currency: 'EUR' });
    const bad = await json(`${base}/api/settings`, {
      method: 'PUT',
      body: JSON.stringify({ lookbackDays: 2 }),
    });
    expect(bad.status).toBe(400);
  });
});

describe('meta API', () => {
  it('degrades to [] without an adapter', async () => {
    const base = await serve(memDb());
    expect(((await json(`${base}/api/meta/accounts`)).body as unknown[])).toEqual([]);
    expect(((await json(`${base}/api/meta/categories`)).body as unknown[])).toEqual([]);
  });

  it('degrades to [] when Actual is unreachable', async () => {
    const base = await serve(memDb(), DOWN);
    expect(((await json(`${base}/api/meta/accounts`)).body as unknown[])).toEqual([]);
  });

  it('lists real names when reachable', async () => {
    const base = await serve(memDb(), LIVE);
    expect(((await json(`${base}/api/meta/accounts`)).body as unknown)).toEqual([
      { id: 'a1', name: 'Checking', offBudget: false },
    ]);
    expect(((await json(`${base}/api/meta/categories`)).body as unknown)).toEqual([
      { id: 'c1', name: 'Groceries' },
    ]);
  });
});

describe('stats breakdown', () => {
  it('computes a live 180d breakdown with transfers excluded', async () => {
    const base = await serve(memDb(), LIVE);
    const { body } = await json(`${base}/api/stats`);
    // 2 txs in a 180d window: (200 − 80)/180; the 500 transfer is out.
    expect(body).toMatchObject({
      spot: 9000,
      windowDays: 180,
      txCount: 2,
      currency: 'EUR',
    });
    const stats = body as Record<string, number>;
    expect(stats.ratePerDay).toBeCloseTo(120 / 180);
    expect(stats.inflowPerDay).toBeCloseTo(200 / 180);
    expect(stats.outflowPerDay).toBeCloseTo(80 / 180);
  });

  it('falls back to stored snapshots when unreachable', async () => {
    const db = memDb();
    db.prepare('INSERT INTO snapshots (date, spot, ratePerDay) VALUES (?, ?, ?)').run('2026-09-05', 500, 7);
    const base = await serve(db, DOWN);
    const { body } = await json(`${base}/api/stats`);
    expect(body).toMatchObject({ spot: 500, ratePerDay: 7, windowDays: 180, txCount: 0 });
  });
});

describe('wishes cooling (#20 backend)', () => {
  it('creates wishes in cooling with a rule-derived timer', async () => {
    const base = await serve(memDb());
    const { status, body } = await json(`${base}/api/wishes`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Boots', price: 40, cadence: 'one-off' }),
    });
    expect(status).toBe(201);
    const wish = body as Record<string, unknown>;
    expect(wish.status).toBe('cooling');
    expect(typeof wish.cooldownUntil).toBe('string');
  });

  it('derives ready once the timer expires, inbox stays put', async () => {
    const base = await serve(memDb());
    const past = await json(`${base}/api/wishes`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Old', price: 40, cadence: 'one-off', cooldownUntil: '2020-01-01' }),
    });
    expect((past.body as Record<string, unknown>).status).toBe('ready');
    const inbox = await json(`${base}/api/wishes`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Maybe', price: 40, cadence: 'one-off', status: 'inbox' }),
    });
    expect((inbox.body as Record<string, unknown>).status).toBe('inbox');
    const list = (await json(`${base}/api/wishes`)).body as { status: string }[];
    expect(list.map((w) => w.status).sort()).toEqual(['inbox', 'ready']);
  });

  it('rules change the derived cooldownUntil', async () => {
    const base = await serve(memDb());
    await json(`${base}/api/settings`, {
      method: 'PUT',
      body: JSON.stringify({ cooldownRules: [{ maxPrice: null, days: 60 }] }),
    });
    const { body } = await json(`${base}/api/wishes`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Big', price: 10, cadence: 'one-off' }),
    });
    const addedAt = (body as Record<string, string>).addedAt.slice(0, 10);
    const until = (body as Record<string, string>).cooldownUntil;
    const diffDays = (Date.parse(until) - Date.parse(addedAt)) / 86_400_000;
    expect(diffDays).toBe(60);
  });
});
