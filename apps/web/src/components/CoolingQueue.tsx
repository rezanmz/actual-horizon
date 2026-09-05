import type { Impact, Wish } from "../types";
import { cooldownRemainingMs, delayDays, formatCountdown, formatMoney, maxDelay } from "../lib";

interface Props {
  wishes: Wish[];
  impacts: Record<string, Impact>;
  currency: string;
  ratePerDay?: number;
  now?: number;
}

export function CoolingQueue({ wishes, impacts, currency, ratePerDay, now = Date.now() }: Props) {
  const cooling = wishes.filter((w) => w.status === "cooling");
  if (cooling.length === 0)
    return <p className="empty-note">Cooling queue is empty — nothing is waiting out its delay.</p>;
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {cooling.map((w) => {
        const raw = maxDelay(impacts[w.id]) ?? (ratePerDay !== undefined ? delayDays(w.price, ratePerDay) : null);
        const delay = raw === null ? null : Math.ceil(raw);
        const remain = cooldownRemainingMs(w.cooldownUntil, now);
        const ready = remain !== null && remain <= 0;
        return (
          <li key={w.id} className="ledger-row">
            <span className="row-main">
              <span className="row-name">{w.name}</span>
              <br />
              <span className="row-meta">
                <span className="mono">{formatMoney(w.price, currency)}</span>
                {w.cadence !== "one-off" ? ` · ${w.cadence}` : ""}
                {remain !== null ? (
                  <>
                    {" "}·{" "}
                    <span className={`due-flag${ready ? " ok" : ""}`}>
                      {ready ? "ready" : `cools ${formatCountdown(remain)}`}
                    </span>
                  </>
                ) : null}
              </span>
            </span>
            <span className="row-side">
              {delay !== null ? (
                <span className="delay-pill">+{delay}d slip</span>
              ) : (
                <span className="mono">impact n/a</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
