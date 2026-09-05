import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { initDb } from './db.js';
import {
  cooldownDaysFor,
  cooldownUntilIso,
  DEFAULT_SETTINGS,
  getSettings,
  updateSettings,
} from './settings.js';

function memDb(): Database.Database {
  const db = new Database(':memory:');
  initDb(db);
  return db;
}

describe('settings defaults', () => {
  it('serves the frozen default shape from an empty db', () => {
    expect(getSettings(memDb())).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.lookbackDays).toBe(180);
  });
});

describe('updateSettings', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = memDb();
  });

  it('merges partial patches over the full shape', () => {
    const next = updateSettings(db, { lookbackDays: 90 });
    expect(next.lookbackDays).toBe(90);
    expect(next.currency).toBe('USD');
    expect(getSettings(db).lookbackDays).toBe(90);
  });

  it('persists exclusion lists', () => {
    const next = updateSettings(db, { excludedAccounts: ['a3'], excludedCategories: ['c1'] });
    expect(next.excludedAccounts).toEqual(['a3']);
    expect(next.excludedCategories).toEqual(['c1']);
    expect(getSettings(db)).toEqual(next);
  });

  it('rejects out-of-range windows and malformed rules', () => {
    expect(() => updateSettings(db, { lookbackDays: 30_000 })).toThrow(/lookbackDays/);
    expect(() => updateSettings(db, { lookbackDays: 'soon' })).toThrow(/lookbackDays/);
    expect(() => updateSettings(db, { cooldownRules: [] })).toThrow(/cooldownRules/);
    expect(() => updateSettings(db, { excludedAccounts: 'a3' })).toThrow(/excludedAccounts/);
    expect(() => updateSettings(db, { currency: '  ' })).toThrow(/currency/);
  });

  it('accepts custom cooldown rules', () => {
    const rules = [
      { maxPrice: 100, days: 5 },
      { maxPrice: null, days: 60 },
    ];
    expect(updateSettings(db, { cooldownRules: rules }).cooldownRules).toEqual(rules);
  });
});

describe('cooldown engine', () => {
  it('applies the <$50:3d <$500:7d else 30d defaults', () => {
    expect(cooldownDaysFor(49.99)).toBe(3);
    expect(cooldownDaysFor(50)).toBe(7);
    expect(cooldownDaysFor(499.99)).toBe(7);
    expect(cooldownDaysFor(500)).toBe(30);
    expect(cooldownDaysFor(10_000)).toBe(30);
  });

  it('reads custom rules with the catch-all last', () => {
    const rules = [
      { maxPrice: null, days: 60 },
      { maxPrice: 100, days: 5 },
    ];
    expect(cooldownDaysFor(10, rules)).toBe(5);
    expect(cooldownDaysFor(500, rules)).toBe(60);
  });

  it('adds whole days to the added date', () => {
    expect(cooldownUntilIso('2026-09-05T10:00:00.000Z', 3)).toBe('2026-09-08');
    expect(cooldownUntilIso('2026-09-05', 0)).toBe('2026-09-05');
  });
});
