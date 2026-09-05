import { useEffect, useState } from "react";
import type { Impact, Wish, WishCadence, WishStatus } from "../types";
import { createWish, deleteWish, getImpact, listWishes, updateWish } from "../api";
import { cooldownRemainingMs, formatCountdown, formatMoney } from "../lib";

const CADENCES: WishCadence[] = ["one-off", "daily", "weekly", "monthly"];
const STATUSES: WishStatus[] = ["inbox", "cooling", "ready", "bought", "rejected"];

export function Wishes() {
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [cadence, setCadence] = useState<WishCadence>("one-off");
  const [preview, setPreview] = useState<{ wishId: string; impact: Impact } | null>(null);

  useEffect(() => {
    listWishes().then(setWishes, (e: Error) => setError(e.message));
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      const w = await createWish({ name, price: Number(price), cadence, status: "inbox" });
      setWishes((prev) => [...prev, w]);
      setName("");
      setPrice("");
      setCadence("one-off");
    } catch (err) {
      setError(err instanceof Error ? err.message : "create failed");
    }
  }

  async function onStatus(w: Wish, status: WishStatus) {
    try {
      const next = await updateWish(w.id, { status });
      setWishes((prev) => prev.map((x) => (x.id === w.id ? next : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "update failed");
    }
  }

  async function onPreview(w: Wish) {
    try {
      const impact = await getImpact(w.id);
      setPreview({ wishId: w.id, impact });
    } catch (err) {
      setError(err instanceof Error ? err.message : "impact failed");
    }
  }

  async function onDelete(w: Wish) {
    if (!window.confirm(`Delete ${w.name}?`)) return;
    try {
      await deleteWish(w.id);
      setWishes((prev) => prev.filter((x) => x.id !== w.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "delete failed");
    }
  }

  return (
    <div>
      <h2>Wishes</h2>
      {error && <p role="alert">{error}</p>}
      <ul>
        {wishes.map((w) => {
          const remain = cooldownRemainingMs(w.cooldownUntil, Date.now());
          return (
            <li key={w.id}>
              {w.name} · {formatMoney(w.price, "USD")} · {w.cadence} · {w.status}
              {remain !== null && w.status === "cooling" ? (
                <> · cooldown {formatCountdown(remain)}</>
              ) : null}{" "}
              <select
                aria-label={`status for ${w.name}`}
                value={w.status}
                onChange={(e) => void onStatus(w, e.target.value as WishStatus)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>{" "}
              <button type="button" onClick={() => void onPreview(w)}>
                Impact
              </button>{" "}
              <button type="button" onClick={() => void onDelete(w)}>
                Delete
              </button>
            </li>
          );
        })}
      </ul>
      {preview && (
        <section data-testid="impact-preview">
          <h3>Impact preview</h3>
          <ul>
            {preview.impact.perGoal.map((g) => (
              <li key={g.goalId}>
                {g.goalId}: {g.oldDate ?? "?"} → {g.newDate ?? "never"} (+{g.delayDays}d)
              </li>
            ))}
          </ul>
          {preview.impact.neverGoals.length > 0 && (
            <p>Never: {preview.impact.neverGoals.join(", ")}</p>
          )}
        </section>
      )}
      <form onSubmit={(e) => void onCreate(e)}>
        <h3>New wish</h3>
        <label>
          Name <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>{" "}
        <label>
          Price <input value={price} onChange={(e) => setPrice(e.target.value)} required inputMode="decimal" />
        </label>{" "}
        <label>
          Cadence{" "}
          <select value={cadence} onChange={(e) => setCadence(e.target.value as WishCadence)}>
            {CADENCES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>{" "}
        <button type="submit">Add wish</button>
      </form>
    </div>
  );
}
