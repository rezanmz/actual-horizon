import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { rowToWish } from '../db.js';
import type { Cadence, Wish, WishStatus } from '../types.js';
import { isIsoDate, isNonNegativeNumber, sendError } from './validate.js';

const CADENCES: readonly string[] = ['one-off', 'daily', 'weekly', 'monthly'];
const STATUSES: readonly string[] = ['inbox', 'cooling', 'ready', 'bought', 'rejected'];

type WishRow = Parameters<typeof rowToWish>[0];

function parseWishBody(body: Record<string, unknown>, partial: boolean): { wish?: object; error?: string } {
  const out: Record<string, unknown> = {};
  if ('name' in body || !partial) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return { error: 'name must be a non-empty string' };
    }
    out.name = (body.name as string).trim();
  }
  if ('price' in body || !partial) {
    if (!isNonNegativeNumber(body.price)) return { error: 'price must be a non-negative number' };
    out.price = body.price;
  }
  if ('cadence' in body || !partial) {
    const cadence = ('cadence' in body ? body.cadence : 'one-off') as unknown;
    if (typeof cadence !== 'string' || !CADENCES.includes(cadence)) {
      return { error: `cadence must be one of ${CADENCES.join('|')}` };
    }
    out.cadence = cadence as Cadence;
  }
  if ('status' in body || !partial) {
    const status = ('status' in body ? body.status : 'inbox') as unknown;
    if (typeof status !== 'string' || !STATUSES.includes(status)) {
      return { error: `status must be one of ${STATUSES.join('|')}` };
    }
    out.status = status as WishStatus;
  }
  for (const key of ['cooldownUntil', 'addedAt'] as const) {
    if (key in body && body[key] !== undefined && body[key] !== null) {
      const v = body[key] as unknown;
      if (key === 'cooldownUntil' && !isIsoDate(v)) {
        return { error: 'cooldownUntil must be an ISO date (YYYY-MM-DD)' };
      }
      if (key === 'addedAt' && typeof v !== 'string') {
        return { error: 'addedAt must be an ISO timestamp string' };
      }
      out[key] = v;
    }
  }
  for (const key of ['linkedGoalId', 'url', 'notes'] as const) {
    if (key in body) {
      const v = body[key] as unknown;
      if (v !== undefined && v !== null && typeof v !== 'string') {
        return { error: `${key} must be a string` };
      }
      if (typeof v === 'string') out[key] = v;
    }
  }
  return { wish: out };
}

/** CRUD /api/wishes → Wish per Contract shape. */
export function wishesRouter(db: Database.Database): Router {
  const router = Router();

  const COLUMNS = 'id, name, price, cadence, status, addedAt, cooldownUntil, linkedGoalId, url, notes';
  const selectAll = db.prepare(`SELECT ${COLUMNS} FROM wishes ORDER BY addedAt DESC`);
  const selectOne = db.prepare(`SELECT ${COLUMNS} FROM wishes WHERE id = ?`);
  const insert = db.prepare(
    `INSERT INTO wishes (id, name, price, cadence, status, addedAt, cooldownUntil, linkedGoalId, url, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const remove = db.prepare('DELETE FROM wishes WHERE id = ?');

  router.get('/', (_req, res) => {
    res.json((selectAll.all() as WishRow[]).map(rowToWish));
  });

  router.post('/', (req, res) => {
    const parsed = parseWishBody((req.body ?? {}) as Record<string, unknown>, false);
    if (parsed.error != null || parsed.wish == null) {
      sendError(res, 400, parsed.error ?? 'invalid wish');
      return;
    }
    const fields = parsed.wish as Record<string, string | number>;
    if (fields.linkedGoalId != null) {
      const goal = db.prepare('SELECT id FROM goals WHERE id = ?').get(fields.linkedGoalId);
      if (goal == null) {
        sendError(res, 400, 'linkedGoalId does not match a goal');
        return;
      }
    }
    const wish: Wish = {
      id: randomUUID(),
      name: fields.name as string,
      price: fields.price as number,
      cadence: fields.cadence as Cadence,
      status: fields.status as WishStatus,
      addedAt: (fields.addedAt as string | undefined) ?? new Date().toISOString(),
    };
    for (const key of ['cooldownUntil', 'linkedGoalId', 'url', 'notes'] as const) {
      if (fields[key] != null) wish[key] = fields[key] as string;
    }
    insert.run(
      wish.id, wish.name, wish.price, wish.cadence, wish.status, wish.addedAt,
      wish.cooldownUntil ?? null, wish.linkedGoalId ?? null, wish.url ?? null, wish.notes ?? null,
    );
    res.status(201).json(wish);
  });

  router.get('/:id', (req, res) => {
    const row = selectOne.get(req.params.id) as WishRow | undefined;
    if (row == null) {
      sendError(res, 404, 'wish not found');
      return;
    }
    res.json(rowToWish(row));
  });

  router.put('/:id', (req, res) => {
    const existing = selectOne.get(req.params.id) as WishRow | undefined;
    if (existing == null) {
      sendError(res, 404, 'wish not found');
      return;
    }
    const parsed = parseWishBody((req.body ?? {}) as Record<string, unknown>, true);
    if (parsed.error != null || parsed.wish == null) {
      sendError(res, 400, parsed.error ?? 'invalid wish');
      return;
    }
    const fields = parsed.wish as Record<string, string | number>;
    if (fields.linkedGoalId != null) {
      const goal = db.prepare('SELECT id FROM goals WHERE id = ?').get(fields.linkedGoalId);
      if (goal == null) {
        sendError(res, 400, 'linkedGoalId does not match a goal');
        return;
      }
    }
    const merged: Wish = { ...rowToWish(existing), ...fields, id: req.params.id } as Wish;
    db.prepare(
      `UPDATE wishes SET name = ?, price = ?, cadence = ?, status = ?, addedAt = ?,
       cooldownUntil = ?, linkedGoalId = ?, url = ?, notes = ? WHERE id = ?`,
    ).run(
      merged.name, merged.price, merged.cadence, merged.status, merged.addedAt,
      merged.cooldownUntil ?? null, merged.linkedGoalId ?? null, merged.url ?? null,
      merged.notes ?? null, merged.id,
    );
    res.json(merged);
  });

  router.delete('/:id', (req, res) => {
    const result = remove.run(req.params.id);
    if (result.changes === 0) {
      sendError(res, 404, 'wish not found');
      return;
    }
    res.status(204).end();
  });

  return router;
}
