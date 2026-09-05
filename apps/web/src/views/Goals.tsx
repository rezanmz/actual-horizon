import { useEffect, useState } from "react";
import type { Goal } from "../types";
import { createGoal, deleteGoal, listGoals, updateGoal } from "../api";

export function Goals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [priority, setPriority] = useState("1");
  const [deadline, setDeadline] = useState("");

  useEffect(() => {
    listGoals().then(setGoals, (e: Error) => setError(e.message));
  }, []);

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
    const name = window.prompt("Goal name", g.name);
    if (name === null) return;
    try {
      const next = await updateGoal(g.id, { name });
      setGoals((prev) => prev.map((x) => (x.id === g.id ? next : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "update failed");
    }
  }

  async function onDelete(g: Goal) {
    if (!window.confirm(`Delete ${g.name}?`)) return;
    try {
      await deleteGoal(g.id);
      setGoals((prev) => prev.filter((x) => x.id !== g.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "delete failed");
    }
  }

  return (
    <div>
      <h2>Goals</h2>
      {error && <p role="alert">{error}</p>}
      <ul>
        {goals.map((g) => (
          <li key={g.id}>
            {g.name} · target {g.target} · priority {g.priority}
            {g.deadline ? ` · due ${g.deadline}` : ""}
            <button type="button" onClick={() => void onRename(g)}>
              Rename
            </button>{" "}
            <button type="button" onClick={() => void onDelete(g)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={(e) => void onCreate(e)}>
        <h3>New goal</h3>
        <label>
          Name <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>{" "}
        <label>
          Target <input value={target} onChange={(e) => setTarget(e.target.value)} required inputMode="decimal" />
        </label>{" "}
        <label>
          Priority <input value={priority} onChange={(e) => setPriority(e.target.value)} inputMode="numeric" />
        </label>{" "}
        <label>
          Deadline <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </label>{" "}
        <button type="submit">Add goal</button>
      </form>
    </div>
  );
}
