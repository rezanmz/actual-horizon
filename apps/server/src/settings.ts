import type Database from 'better-sqlite3';
import { getSetting, setSetting } from './db.js';

/** One cooldown tier: prices below maxPrice cool for `days` days. */
export interface CooldownRule {
  /** Price ceiling in currency units; null = catch-all for anything above. */
  maxPrice: number | null;
  days: number;
}

/** Persisted horizon settings (GET/PUT /api/settings). */
export interface AppSettings {
  /** Trailing window in days the savings rate is computed over. */
  lookbackDays: number;
  /** Actual account ids excluded from net-worth + rate. */
  excludedAccounts: string[];
  /** Actual category ids excluded from the rate. */
  excludedCategories: string[];
  /** Price-tiered cooldown rules, ascending; null maxPrice last. */
  cooldownRules: CooldownRule[];
  /** ISO 4217 currency code. */
  currency: string;
}

/**
 * Documented defaults: 180d lookback (a hot month overstates the rate ~2x
 * on 30d), nothing excluded, <$50:3d <$500:7d else 30d, USD.
 */
export const DEFAULT_SETTINGS: AppSettings = {
  lookbackDays: 180,
  excludedAccounts: [],
  excludedCategories: [],
  cooldownRules: [
    { maxPrice: 50, days: 3 },
    { maxPrice: 500, days: 7 },
    { maxPrice: null, days: 30 },
  ],
  currency: 'USD',
};

export const MIN_LOOKBACK_DAYS = 7;
export const MAX_LOOKBACK_DAYS = 365;

/** Read the full settings shape, falling back to defaults per key. */
export function getSettings(db: Database.Database): AppSettings {
  return {
    lookbackDays: parseLookbackDays(getSetting(db, 'lookbackDays')) ?? DEFAULT_SETTINGS.lookbackDays,
    excludedAccounts: parseIdList(getSetting(db, 'excludedAccounts')),
    excludedCategories: parseIdList(getSetting(db, 'excludedCategories')),
    cooldownRules: parseCooldownRules(getSetting(db, 'cooldownRules')) ?? DEFAULT_SETTINGS.cooldownRules,
    currency: parseCurrency(getSetting(db, 'currency')) ?? DEFAULT_SETTINGS.currency,
  };
}

export type SettingsPatch = Partial<{
  lookbackDays: unknown;
  excludedAccounts: unknown;
  excludedCategories: unknown;
  cooldownRules: unknown;
  currency: unknown;
}>;

/**
 * Validate a partial PUT body and persist the valid fields.
 * Returns the merged full shape. Throws with a human message on invalid input.
 */
export function updateSettings(db: Database.Database, patch: SettingsPatch): AppSettings {
  const current = getSettings(db);
  const next: AppSettings = { ...current };

  if (patch.lookbackDays !== undefined) {
    const days = parseLookbackDays(patch.lookbackDays);
    if (days == null) {
      throw new Error(`lookbackDays must be an integer ${MIN_LOOKBACK_DAYS}..${MAX_LOOKBACK_DAYS}`);
    }
    next.lookbackDays = days;
  }
  if (patch.excludedAccounts !== undefined) {
    next.excludedAccounts = checkedIdList(patch.excludedAccounts, 'excludedAccounts');
  }
  if (patch.excludedCategories !== undefined) {
    next.excludedCategories = checkedIdList(patch.excludedCategories, 'excludedCategories');
  }
  if (patch.cooldownRules !== undefined) {
    const rules = parseCooldownRules(patch.cooldownRules);
    if (rules == null) {
      throw new Error(
        'cooldownRules must be a non-empty array of { maxPrice: number|null, days: non-negative number }',
      );
    }
    next.cooldownRules = rules;
  }
  if (patch.currency !== undefined) {
    const currency = parseCurrency(patch.currency);
    if (currency == null) throw new Error('currency must be a non-empty string');
    next.currency = currency;
  }

  setSetting(db, 'lookbackDays', String(next.lookbackDays));
  setSetting(db, 'excludedAccounts', JSON.stringify(next.excludedAccounts));
  setSetting(db, 'excludedCategories', JSON.stringify(next.excludedCategories));
  setSetting(db, 'cooldownRules', JSON.stringify(next.cooldownRules));
  setSetting(db, 'currency', next.currency);
  return next;
}

/**
 * Cooldown tier for a price: first rule (ascending, null cap last) whose
 * maxPrice is null or strictly above the price wins, so <$50:3d <$500:7d
 * else 30d under the defaults.
 */
export function cooldownDaysFor(price: number, rules: readonly CooldownRule[] = DEFAULT_SETTINGS.cooldownRules): number {
  const ordered = [...rules].sort((a, b) => {
    if (a.maxPrice == null) return 1;
    if (b.maxPrice == null) return -1;
    return a.maxPrice - b.maxPrice;
  });
  for (const rule of ordered) {
    if (rule.maxPrice == null || price < rule.maxPrice) return rule.days;
  }
  return ordered.at(-1)?.days ?? 30;
}

/** ISO date (YYYY-MM-DD) `days` after the date part of `fromIso`. */
export function cooldownUntilIso(fromIso: string, days: number): string {
  const base = fromIso.slice(0, 10);
  const at = new Date(`${base}T00:00:00.000Z`);
  at.setUTCDate(at.getUTCDate() + Math.max(0, Math.floor(days)));
  return at.toISOString().slice(0, 10);
}

function parseLookbackDays(value: unknown): number | null {
  if (typeof value === 'string') {
    if (value.trim() === '') return null;
    const n = Number(value);
    if (!Number.isInteger(n)) return null;
    return n >= MIN_LOOKBACK_DAYS && n <= MAX_LOOKBACK_DAYS ? n : null;
  }
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value >= MIN_LOOKBACK_DAYS && value <= MAX_LOOKBACK_DAYS ? value : null;
  }
  return null;
}

function parseIdList(value: string | null): string[] {
  if (value == null) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return checkedIdList(parsed, 'excluded list');
  } catch {
    return [];
  }
}

function checkedIdList(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || !value.every((v): v is string => typeof v === 'string')) {
    throw new Error(`${name} must be an array of strings`);
  }
  return [...new Set(value)];
}

function parseCooldownRules(value: unknown): CooldownRule[] | null {
  const raw: unknown = typeof value === 'string' ? safeJson(value) : value;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const rules: CooldownRule[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) return null;
    const { maxPrice, days } = entry as Record<string, unknown>;
    if (maxPrice !== null && !(typeof maxPrice === 'number' && Number.isFinite(maxPrice) && maxPrice > 0)) {
      return null;
    }
    if (!(typeof days === 'number' && Number.isFinite(days) && days >= 0)) return null;
    rules.push({ maxPrice, days });
  }
  return rules;
}

function parseCurrency(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
