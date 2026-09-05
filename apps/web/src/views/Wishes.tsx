import { useEffect, useState } from "react";
import type { Goal, Impact, Wish, WishCadence, WishStatus } from "../types";
import { createWish, deleteWish, getImpact, listGoals, listWishes, updateWish } from "../api";
import { cooldownRemainingMs, formatCountdown, formatMoney, maxDelay, UNDECIDED_STATUSES } from "../lib";

const CADENCES: WishCadence[] = ["one-off", "daily", "weekly", "monthly"];
const STATUSES: WishStatus[] = ["inbox", "cooling", "ready", "bought", "rejected"];

export interface WishesData {
  wishes: Wish[];
  goals: Goal[];
  impacts: Record<string, Impact>;
}

interface Props {
  initial?: WishesData;
  currency?: string;
}

export function Wishes({ initial, currency = "USD" }: Props) {
  const [wishes, setWishes] = useState<Wish[]>(initial?.wishes ?? []);
  const [goals, setGoals] = useState<Goal[]>(initial?.goals ?? []);
  const [impacts, setImpacts] = useState<Record<string, Impact>>(initial?.impacts ?? {});
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [cadence, setCadence] = useState<WishCadence>("one-off");
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const first = (initial?.wishes ?? []).find(
      (w) => UNDECIDED_STATUSES.includes(w.status) && initial?.impacts[w.id],
    );
    return first?.id ?? null;
  });

  useEffect(() => {
    if (initial) return;
    let live = true;
    (async () => {
      try {
        const [w, g] = await Promise.all([listWishes(), listGoals().catch((): Goal[] => [])]);
        if (!live) return;
        setWishes(w);
        setGoals(g);
        const undecided = w.filter((x) => UNDECIDED_STATUSES.includes(x.status));
        const found: Record<string, Impact> = {};
        await Promise.all(
          undecided.map(async (x) => {
            try {
              found[x.id] = await getImpact(x.id);
            } catch {
              /* row shows n/a */
            }
          }),
        );
        if (live) {
          setImpacts(found);
          const first = undecided[0];
          if (first && found[first.id]) setSelectedId(first.id);
        }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "failed to load");
      }
    })();
    return () => {
      live = false;
    };
  }, [initial]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      const w = await createWish({ name, price: Number(price), cadence, status: "cooling" });
      setWishes((prev) => [...prev, w]);
      setName("");
      setPrice("");
      setCadence("one-off");
      try {
        const impact = await getImpact(w.id);
        setImpacts((prev) => ({ ...prev, [w.id]: impact }));
        setSelectedId(w.id);
      } catch {
        /* queue row renders without impact */
      }
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
    setSelectedId(w.id);
    if (impacts[w.id]) return;
    try {
      const impact = await getImpact(w.id);
      setImpacts((prev) => ({ ...prev, [w.id]: impact }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "impact failed");
    }
  }

  async function onDelete(w: Wish) {
    if (!window.confirm(`Strike ${w.name} from the ledger?`)) return;
    try {
      await deleteWish(w.id);
      setWishes((prev) => prev.filter((x) => x.id !== w.id));
      if (selectedId === w.id) setSelectedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "delete failed");
    }
  }

  const goalName = (id: string) => goals.find((g) => g.id === id)?.name ?? id;
  const undecided = wishes.filter((w) => UNDECIDED_STATUSES.includes(w.status));
  const settled = wishes.filter((w) => !UNDECIDED_STATUSES.includes(w.status));
  const selected = wishes.find((w) => w.id === selectedId) ?? null;
  const selectedImpact = selected ? impacts[selected.id] : undefined;

  return (
    <div className="ledger-grid">
      <section className="entry span-7 rise" style={{ ["--d" as string]: "0ms" }} aria-label="Wishes awaiting decision">
        <div className="entry-head">
          
          <h2>Awaiting decision</h2>
          <span className="sub">{undecided.length} wishes</span>
        </div>
        <p className="legend">
          New wishes start <strong>cooling</strong> — the waiting timer from your rules. When it runs out they turn{" "}
          <strong>ready</strong> for a decision. <strong>Inbox</strong> parks an idea with no timer.{" "}
          <strong>Bought</strong> / <strong>rejected</strong> close it out below.
        </p>
        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
        {undecided.length === 0 ? (
          <p className="empty-note">Nothing awaiting decision — every wish is settled or the ledger is empty.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {undecided.map((w) => {
              const raw = maxDelay(impacts[w.id]);
              const delay = raw === null ? null : Math.ceil(raw);
              const remain = cooldownRemainingMs(w.cooldownUntil, Date.now());
              const isSel = w.id === selectedId;
              return (
                <li key={w.id} className="ledger-row" style={isSel ? { background: "rgba(178, 58, 29, 0.06)" } : undefined}>
                  <span className="row-main">
                    <span className="row-name">{w.name}</span>{" "}
                    <span className={`chip ${w.status}`}>{w.status}</span>
                    <br />
                    <span className="row-meta">
                      <span className="mono">{formatMoney(w.price, currency)}</span>
                      {w.cadence !== "one-off" ? ` · ${w.cadence}` : ""}
                      {remain !== null && w.status === "cooling" ? (
                        <> · cools {formatCountdown(remain)}</>
                      ) : null}
                      {" · "}
                      {delay !== null ? (
                        <span>
                          delays goals by <strong className="mono">{delay}d</strong>
                        </span>
                      ) : (
                        <span className="mono">impact n/a</span>
                      )}
                    </span>
                  </span>
                  <span className="row-side btn-row" style={{ justifyContent: "flex-end" }}>
                    <button type="button" className="btn small primary" onClick={() => void onPreview(w)}>
                      Preview impact
                    </button>
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
                    </select>
                    <button type="button" className="btn ghost small" onClick={() => void onDelete(w)}>
                      Strike
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {settled.length > 0 && (
          <>
            <div className="entry-head" style={{ marginTop: 20 }}>
              
              <h2>Settled</h2>
              <span className="sub">{settled.length} closed</span>
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {settled.map((w) => (
                <li key={w.id} className="ledger-row">
                  <span className="row-main">
                    <span className="row-name">{w.name}</span> <span className={`chip ${w.status}`}>{w.status}</span>
                    <br />
                    <span className="row-meta mono">{formatMoney(w.price, currency)}</span>
                  </span>
                  <span className="row-side btn-row" style={{ justifyContent: "flex-end" }}>
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
                    </select>
                    <button type="button" className="btn ghost small" onClick={() => void onDelete(w)}>
                      Strike
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <div className="span-5" style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
        <section className="entry rise accent-top" style={{ ["--d" as string]: "80ms" }} data-testid="impact-preview" aria-label="Impact preview">
          <div className="entry-head">
            
            <h2>Impact preview</h2>
          </div>
          {!selected ? (
            <p className="empty-note">Choose “Preview impact” on any undecided wish to see which goals slip, and by how long.</p>
          ) : !selectedImpact ? (
            <p className="loading-line">Reading the ledger for {selected.name}…</p>
          ) : selectedImpact.perGoal.length === 0 && selectedImpact.neverGoals.length === 0 ? (
            <p className="empty-note">
              {selected.name} moves no goal — the rate absorbs it whole.
            </p>
          ) : (
            <div>
              <p className="row-meta" style={{ marginTop: 0 }}>
                Buying <strong>{selected.name}</strong> for{" "}
                <span className="mono">{formatMoney(selected.price, currency)}</span>:
              </p>
              {selectedImpact.perGoal.length > 0 && (
                <table className="impact-table">
                  <thead>
                    <tr>
                      <th scope="col">Goal</th>
                      <th scope="col">Was</th>
                      <th scope="col">Slips to</th>
                      <th scope="col">Delay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedImpact.perGoal.map((g) => (
                      <tr key={g.goalId}>
                        <td>{goalName(g.goalId)}</td>
                        <td>{g.oldDate ?? "—"}</td>
                        <td>{g.newDate ?? "never"}</td>
                        <td>
                          <span className={`delay-pill${Math.ceil(g.delayDays) >= 14 ? " bad" : ""}`}>
                            +{Math.ceil(g.delayDays)}d
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {selectedImpact.neverGoals.length > 0 && (
                <p className="alert" style={{ marginTop: 12 }}>
                  Never reached if bought: {selectedImpact.neverGoals.map(goalName).join(", ")}
                </p>
              )}
            </div>
          )}
        </section>

        <section className="entry rise" style={{ ["--d" as string]: "140ms" }} aria-label="New wish">
          <form onSubmit={(e) => void onCreate(e)} className="form-ledger" style={{ marginTop: 0 }}>
            <h3>Enter a new wish</h3>
            <div className="field-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
              <label className="field">
                <span>Name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Headphones" />
              </label>
              <label className="field">
                <span>Price</span>
                <input value={price} onChange={(e) => setPrice(e.target.value)} required inputMode="decimal" placeholder="349" />
              </label>
              <label className="field">
                <span>Cadence</span>
                <select value={cadence} onChange={(e) => setCadence(e.target.value as WishCadence)}>
                  {CADENCES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="btn primary">
                Add wish
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
