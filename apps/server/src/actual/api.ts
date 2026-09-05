/**
 * Production wiring for ActualDeps on top of `@actual-app/api` (exact pin
 * `@actual-app/api@26.9.0`, owned by Backend in apps/server/package.json).
 * Static imports: drift fails the build, not a health check.
 */

import {
  downloadBudget,
  getAccountBalance,
  getAccounts,
  getCategories,
  getPreferences,
  getServerVersion,
  getTransactions,
  init,
  shutdown,
  sync,
} from '@actual-app/api';

import type {
  ActualAccount,
  ActualCategory,
  ActualDeps,
  ActualTransaction,
  BudgetPreferences,
  InitArgs,
  InitHandle,
  ServerVersionProbe,
} from './types.js';

function initArgs(args: InitArgs): Parameters<typeof init>[0] {
  const base = {
    serverURL: args.serverURL,
    verbose: false,
    ...(args.dataDir !== undefined ? { dataDir: args.dataDir } : {}),
  };
  if (args.password !== undefined) return { ...base, password: args.password };
  if (args.sessionToken !== undefined) return { ...base, sessionToken: args.sessionToken };
  throw new Error('Actual init requires a password or session token');
}

async function initHandle(args: InitArgs): Promise<InitHandle> {
  const handle = await init(initArgs(args));
  return { integerToAmount: handle.integerToAmount };
}

async function preferences(): Promise<BudgetPreferences> {
  const prefs = await getPreferences();
  return { defaultCurrencyCode: prefs.defaultCurrencyCode };
}

async function serverVersion(): Promise<ServerVersionProbe> {
  const probe = await getServerVersion();
  if ('version' in probe) return { version: probe.version };
  return { error: probe.error };
}

async function transactions(
  accountId: string,
  startDate: string,
  endDate: string,
): Promise<ActualTransaction[]> {
  const rows = await getTransactions(accountId, startDate, endDate);
  return rows.map((row) => ({
    date: row.date,
    amount: row.amount,
    transfer_id: row.transfer_id,
    is_child: row.is_child,
    category: row.category ?? null,
  }));
}

async function categories(): Promise<ActualCategory[]> {
  const rows = await getCategories();
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

async function accounts(): Promise<ActualAccount[]> {
  const rows = await getAccounts();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    offbudget: row.offbudget,
    closed: row.closed,
  }));
}

/** Default live dependencies for ActualConnector.connect. */
export const defaultActualDeps: ActualDeps = {
  init: initHandle,
  downloadBudget: (syncId, opts) =>
    opts.password === undefined
      ? downloadBudget(syncId)
      : downloadBudget(syncId, { password: opts.password }),
  sync,
  getAccounts: accounts,
  getCategories: categories,
  getAccountBalance: (id, cutoff) => getAccountBalance(id, cutoff),
  getTransactions: transactions,
  getServerVersion: serverVersion,
  getPreferences: preferences,
  shutdown,
};
