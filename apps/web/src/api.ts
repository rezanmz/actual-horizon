import type {
  Goal,
  Health,
  Impact,
  MetaEntry,
  Settings,
  Snapshot,
  Stats,
  Wish,
} from "./types";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path}: ${res.status}`);
  // DELETE answers 204 with no body — only parse when there is one (#28).
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const getHealth = () => req<Health>("/api/health");
export const getStats = () => req<Stats>("/api/stats");
export const getSnapshots = (days = 90) =>
  req<Snapshot[]>(`/api/snapshots?days=${encodeURIComponent(String(days))}`);
export const getImpact = (wishId: string) =>
  req<Impact>(`/api/impact?wishId=${encodeURIComponent(wishId)}`);

export const listGoals = () => req<Goal[]>("/api/goals");
export const createGoal = (g: Omit<Goal, "id">) =>
  req<Goal>("/api/goals", { method: "POST", body: JSON.stringify(g) });
export const updateGoal = (id: string, g: Partial<Omit<Goal, "id">>) =>
  req<Goal>(`/api/goals/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(g),
  });
export const deleteGoal = async (id: string): Promise<void> => {
  await req<unknown>(`/api/goals/${encodeURIComponent(id)}`, { method: "DELETE" });
};

export const listWishes = () => req<Wish[]>("/api/wishes");
export const createWish = (w: Omit<Wish, "id" | "addedAt">) =>
  req<Wish>("/api/wishes", { method: "POST", body: JSON.stringify(w) });
export const updateWish = (id: string, w: Partial<Omit<Wish, "id">>) =>
  req<Wish>(`/api/wishes/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(w),
  });
export const deleteWish = async (id: string): Promise<void> => {
  await req<unknown>(`/api/wishes/${encodeURIComponent(id)}`, { method: "DELETE" });
};

/** Frozen contract #18: ledger settings + metadata. */
export const getSettings = () => req<Settings>("/api/settings");
export const updateSettings = (patch: Partial<Settings>) =>
  req<Settings>("/api/settings", { method: "PUT", body: JSON.stringify(patch) });

/** [] when Actual is unreachable — callers MUST render a graceful empty state. */
export const getMetaAccounts = () => req<MetaEntry[]>("/api/meta/accounts");
export const getMetaCategories = () => req<MetaEntry[]>("/api/meta/categories");
