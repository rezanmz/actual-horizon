import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { rowToGoal } from '../db.js';
import type { Goal } from '../types.js';
import { isIsoDate, isPositiveNumber, sendError } from './validate.js';

interface GoalBody {
  name?: unknown;
  target?: unknown;
  priority?: unknown;
  deadline?: unknown;
}

function parseGoalBody(body: GoalBody, partial: boolean): { goal?: Omit<Goal, 'id'>; error?: string } {
  const out: Record<string, unknown> = {};
  if ('name' in body || !partial) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return { error: 'name must be a non-empty string' };
    }
    out.name = body.name.trim();
  }
  if ('target' in body || !partial) {
    if (!isPositiveNumber(body.target)) return { error: 'target must be a positive number' };
    out.target = body.target;
  }
  if ('priority' in body || !partial) {
    const p = body.priority ?? 0;
    if (typeof p !== 'number' || !Number.isInteger(p) || p < 0) {
      return { error: 'priority must be a non-negative integer' };
    }
    out.priority = p;
  }
  if ('deadline' in body) {
    if (body.deadline !== undefined && body.deadline !== null && !isIsoDate(body.deadline)) {
      return { error: 'deadline must be an ISO date (YYYY-MM-DD)' };
    }
    if (body.deadline != null) out.deadline = body.deadline;
  }
  return { goal: out as Omit<Goal, 'id'> };
}

/** CRUD /api/goals → Goal{id, name, target, priority, deadline?}. */
export function goalsRouter(db: Database.Database): Router {
  const router = Router();

  const selectAll = db.prepare('SELECT id, name, target, priority, deadline FROM goals ORDER BY priority ASC, name ASC');
  const selectOne = db.prepare('SELECT id, name, target, priority, deadline FROM goals WHERE id = ?');
  const insert = db.prepare(
    'INSERT INTO goals (id, name, target, priority, deadline) VALUES (?, ?, ?, ?, ?)',
  );
  const remove = db.prepare('DELETE FROM goals WHERE id = ?');

  router.get('/', (_req, res) => {
    const rows = selectAll.all() as Parameters<typeof rowToGoal>[0][];
    res.json(rows.map(rowToGoal));
  });

  router.post('/', (req, res) => {
    const parsed = parseGoalBody(req.body as GoalBody, false);
    if (parsed.error != null || parsed.goal == null) {
      sendError(res, 400, parsed.error ?? 'invalid goal');
      return;
    }
    const goal: Goal = { id: randomUUID(), ...parsed.goal };
    insert.run(goal.id, goal.name, goal.target, goal.priority, goal.deadline ?? null);
    res.status(201).json(goal);
  });

  router.get('/:id', (req, res) => {
    const row = selectOne.get(req.params.id) as Parameters<typeof rowToGoal>[0] | undefined;
    if (row == null) {
      sendError(res, 404, 'goal not found');
      return;
    }
    res.json(rowToGoal(row));
  });

  router.put('/:id', (req, res) => {
    const existing = selectOne.get(req.params.id) as Parameters<typeof rowToGoal>[0] | undefined;
    if (existing == null) {
      sendError(res, 404, 'goal not found');
      return;
    }
    const parsed = parseGoalBody(req.body as GoalBody, true);
    if (parsed.error != null || parsed.goal == null) {
      sendError(res, 400, parsed.error ?? 'invalid goal');
      return;
    }
    const merged: Goal = { ...rowToGoal(existing), ...parsed.goal, id: req.params.id };
    db.prepare('UPDATE goals SET name = ?, target = ?, priority = ?, deadline = ? WHERE id = ?').run(
      merged.name,
      merged.target,
      merged.priority,
      merged.deadline ?? null,
      merged.id,
    );
    res.json(merged);
  });

  router.delete('/:id', (req, res) => {
    const result = remove.run(req.params.id);
    if (result.changes === 0) {
      sendError(res, 404, 'goal not found');
      return;
    }
    res.status(204).end();
  });

  return router;
}
