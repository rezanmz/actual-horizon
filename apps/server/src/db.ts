import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Cadence, Goal, Wish, WishStatus } from './types.js';

const CADENCES: readonly Cadence[] = ['one-off', 'daily', 'weekly', 'monthly'];
const STATUSES: readonly WishStatus[] = ['inbox', 'cooling', 'ready', 'bought', 'rejected'];

export function resolveDbPath(): string {
  const dir = process.env.DATA_DIR ?? resolve(process.cwd(), 'data');
  return resolve(dir, 'app.db');
}

/** Open (creating parent dirs) and migrate the SQLite sidecar. */
export function openDb(path: string = resolveDbPath()): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initDb(db);
  return db;
}

/** Idempotent schema migration for the sidecar tables. */
export function initDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      target REAL NOT NULL CHECK (target > 0),
      priority INTEGER NOT NULL DEFAULT 0,
      deadline TEXT
    );
    CREATE TABLE IF NOT EXISTS wishes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price REAL NOT NULL CHECK (price >= 0),
      cadence TEXT NOT NULL DEFAULT 'one-off',
      status TEXT NOT NULL DEFAULT 'inbox',
      addedAt TEXT NOT NULL,
      cooldownUntil TEXT,
      linkedGoalId TEXT REFERENCES goals(id) ON DELETE SET NULL,
      url TEXT,
      notes TEXT
    );
    CREATE TABLE IF NOT EXISTS snapshots (
      date TEXT PRIMARY KEY,
      spot REAL NOT NULL,
      ratePerDay REAL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

interface GoalRow {
  id: string;
  name: string;
  target: number;
  priority: number;
  deadline: string | null;
}

interface WishRow {
  id: string;
  name: string;
  price: number;
  cadence: string;
  status: string;
  addedAt: string;
  cooldownUntil: string | null;
  linkedGoalId: string | null;
  url: string | null;
  notes: string | null;
}

export function rowToGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    name: row.name,
    target: row.target,
    priority: row.priority,
    ...(row.deadline != null ? { deadline: row.deadline } : {}),
  };
}

export function rowToWish(row: WishRow): Wish {
  if (!isCadence(row.cadence)) throw new Error(`corrupt wish cadence: ${row.cadence}`);
  if (!isStatus(row.status)) throw new Error(`corrupt wish status: ${row.status}`);
  return {
    id: row.id,
    name: row.name,
    price: row.price,
    cadence: row.cadence,
    status: row.status,
    addedAt: row.addedAt,
    ...(row.cooldownUntil != null ? { cooldownUntil: row.cooldownUntil } : {}),
    ...(row.linkedGoalId != null ? { linkedGoalId: row.linkedGoalId } : {}),
    ...(row.url != null ? { url: row.url } : {}),
    ...(row.notes != null ? { notes: row.notes } : {}),
  };
}

function isCadence(value: string): value is Cadence {
  return (CADENCES as readonly string[]).includes(value);
}

function isStatus(value: string): value is WishStatus {
  return (STATUSES as readonly string[]).includes(value);
}

export function getSetting(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(db: Database.Database, key: string, value: string): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    value,
  );
}
