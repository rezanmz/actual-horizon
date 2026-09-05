import { useEffect, useState } from "react";
import type { Goal } from "../types";
import { createGoal, deleteGoal, listGoals, updateGoal } from "../api";
import { formatMoney } from "../lib";

interface Props {
  initial?: Goal[];
  currency?: string;
}

export function Goals({ initial, currency = "USD" }: Props) {
  const [goals, setGoals] = useState<Goal[]>(initial ?? []);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [priority, setPriority] = useState("1");
  const [deadline, setDeadline] = useState("");

  useEffect(() => {
    if (initial) return;
    listGoals().then(setGoals, (e: Error) => setError(e.message));
  }, [initial]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      const g = await createGoal({
        name,
        target: Number(target),
        priority: Number(priority),
        ...(deadline ? { deadline } : {}),
      });
      setGoals((prev) => [...prev, g]);
      setName("");
      setTarget("");
      setPriority("1");
      setDeadline("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "create failed");
    }
  }

  async function onRename(g: Goal) {
    const next = window.prompt("Goal name", g.name);
    if (next === null) return;
    try {
      const updated = await updateGoal(g.id, { name: next });
      setGoals((prev) => prev.map((x) => (x.id === g.id ? updated : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "update failed");
    }
  }

  async function onDelete(g: Goal) {
    if (!window.confirm(`Strike ${g.name} from the ledger?`)) return;
    try {
      await deleteGoal(g.id);
      setGoals((prev) => prev.filter((x) => x.id !== g.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "delete failed");
    }
  }

  const ordered = [...goals].sort((a, b) => a.priority - b.priority);

  return (
    <div className="ledger-grid">
      <section className="entry span-8 rise" style={{ ["--d" as string]: "0ms" }} aria-label="Goals ledger">
        <div className="entry-head">
          <span className="entry-no">05</span>
          <h2>Goals</h2>
          <span className="sub">{goals.length} on the books</span>
        </div>
        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
        {ordered.length === 0 ? (
          <p className="empty-note">No goals yet — enter the first one below.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {ordered.map((g) => (
              <li key={g.id} className="ledger-row">
                <span className="row-main">
                  <span className="row-name">
                    <span className="mono" style={{ color: "var(--ink-faint)", marginRight: 8 }}>
                      {String(g.priority).padStart(2, "0")}
                    </span>
                    {g.name}
                  </span>
                  <br />
                  <span className="row-meta">
                    <span className="mono">{formatMoney(g.target, currency)}</span>
                    {g.deadline ? (
                      <span className="due-flag" style={{ marginLeft: 8 }}>
                        due {g.deadline}
                      </span>
                    ) : (
                      " · no deadline"
                    )}
                  </span>
                </span>
                <span className="row-side btn-row" style={{ justifyContent: "flex-end" }}>
                  <button type="button" className="btn ghost small" onClick={() => void onRename(g)}>
                    Rename
                  </button>
                  <button type="button" className="btn ghost small" onClick={() => void onDelete(g)}>
                    Strike
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="entry span-4 rise accent-top" style={{ ["--d" as string]: "80ms" }} aria-label="New goal">
        <form onSubmit={(e) => void onCreate(e)} className="form-ledger" style={{ marginTop: 0 }}>
          <h3>Enter a new goal</h3>
          <div className="field-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <label className="field">
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Emergency fund" />
            </label>
            <label className="field">
              <span>Target amount</span>
              <input value={target} onChange={(e) => setTarget(e.target.value)} required inputMode="decimal" placeholder="15000" />
            </label>
            <label className="field">
              <span>Priority (1 first)</span>
              <input value={priority} onChange={(e) => setPriority(e.target.value)} inputMode="numeric" />
            </label>
            <label className="field">
              <span>Deadline</span>
              <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </label>
            <button type="submit" className="btn primary">
              Add goal
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
