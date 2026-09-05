import type { Impact, Wish } from "../types";
import { cooldownRemainingMs, formatCountdown, formatMoney, maxDelay } from "../lib";

interface Props {
  wishes: Wish[];
  impacts: Record<string, Impact>;
  currency: string;
  now?: number;
}

export function CoolingQueue({ wishes, impacts, currency, now = Date.now() }: Props) {
  const cooling = wishes.filter((w) => w.status === "cooling");
  if (cooling.length === 0) return <p>Cooling queue is empty.</p>;
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {cooling.map((w) => {
        const delay = maxDelay(impacts[w.id]);
        const remain = cooldownRemainingMs(w.cooldownUntil, now);
        return (
          <li
            key={w.id}
            style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}
          >
            <span>
              <strong>{w.name}</strong> · {formatMoney(w.price, currency)}
              {w.cadence !== "one-off" ? ` · ${w.cadence}` : ""}
            </span>
            <span style={{ fontSize: 12, color: "#555", textAlign: "right" }}>
              {remain !== null ? <span>cooldown {formatCountdown(remain)} · </span> : null}
              {delay !== null ? `delays goals by ${delay}d` : "impact n/a"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
