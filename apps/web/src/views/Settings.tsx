import { useEffect, useState } from "react";
import type { CooldownRule, MetaEntry, Settings as LedgerSettings } from "../types";
import { getMetaAccounts, getMetaCategories, getSettings, updateSettings } from "../api";
import { fixtureSettings } from "../lib";

export interface SettingsData {
  settings: LedgerSettings;
  accounts: MetaEntry[];
  categories: MetaEntry[];
  metaReachable: boolean;
}

interface Props {
  initial?: SettingsData;
}

const LOOKBACK_PRESETS = [30, 90, 180, 365];
const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD"];

function ruleLabel(r: CooldownRule): string {
  return r.maxPrice === null ? "over the last tier" : `up to ${r.maxPrice}`;
}

export function Settings({ initial }: Props) {
  const [settings, setSettings] = useState<LedgerSettings>(initial?.settings ?? fixtureSettings);
  const [accounts, setAccounts] = useState<MetaEntry[]>(initial?.accounts ?? []);
  const [categories, setCategories] = useState<MetaEntry[]>(initial?.categories ?? []);
  const [metaReachable, setMetaReachable] = useState(initial?.metaReachable ?? true);
  const [loaded, setLoaded] = useState(initial !== undefined);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (initial) return;
    let live = true;
    (async () => {
      try {
        const s = await getSettings().catch((): LedgerSettings => fixtureSettings);
        const [ac, ct] = await Promise.all([
          getMetaAccounts().catch((): MetaEntry[] => []),
          getMetaCategories().catch((): MetaEntry[] => []),
        ]);
        if (!live) return;
        setSettings(s);
        setAccounts(ac);
        setCategories(ct);
        // Empty meta lists mean Actual is unreachable — exclusions wait for a connection.
        setMetaReachable(ac.length > 0 || ct.length > 0);
        setLoaded(true);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "failed to load settings");
      }
    })();
    return () => {
      live = false;
    };
  }, [initial]);

  async function save(patch: Partial<LedgerSettings>, label: string) {
    setError(null);
    setSaved(null);
    try {
      const next = await updateSettings(patch);
      setSettings(next);
      setSaved(label);
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
    }
  }

  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  if (!loaded) return <p className="loading-line">Opening the settings ledger…</p>;

  return (
    <div className="ledger-grid">
      <section className="entry span-6 rise" style={{ ["--d" as string]: "0ms" }} aria-label="Rate window">
        <div className="entry-head">
          
          <h2>Rate window</h2>
          {saved === "window" && <span className="saved-tick">saved ✓</span>}
        </div>
        <p className="row-meta" style={{ marginTop: 0 }}>
          The daily rate is net flow over this many days. Short windows flatter lucky months;
          the ledger defaults to <strong>180 days</strong> so wishes are priced honestly.
        </p>
        <div className="btn-row" role="group" aria-label="Lookback presets">
          {LOOKBACK_PRESETS.map((d) => (
            <button
              key={d}
              type="button"
              className={`btn small${settings.lookbackDays === d ? " primary" : ""}`}
              aria-pressed={settings.lookbackDays === d}
              onClick={() => void save({ lookbackDays: d }, "window")}
            >
              {d}d
            </button>
          ))}
        </div>
        <form
          className="form-ledger"
          onSubmit={(e) => {
            e.preventDefault();
            const v = Number(new FormData(e.currentTarget).get("lookback"));
            if (Number.isFinite(v) && v > 0) void save({ lookbackDays: Math.round(v) }, "window");
          }}
        >
          <h3>Custom window</h3>
          <div className="field-row">
            <label className="field">
              <span>Lookback days</span>
              <input name="lookback" key={settings.lookbackDays} defaultValue={settings.lookbackDays} inputMode="numeric" min={1} />
            </label>
            <button type="submit" className="btn small">
              Apply
            </button>
          </div>
        </form>
      </section>

      <section className="entry span-6 rise" style={{ ["--d" as string]: "70ms" }} aria-label="Currency">
        <div className="entry-head">
          
          <h2>Currency</h2>
          {saved === "currency" && <span className="saved-tick">saved ✓</span>}
        </div>
        <p className="row-meta" style={{ marginTop: 0 }}>
          Every figure in the ledger is rendered in this currency.
        </p>
        <div className="btn-row" role="group" aria-label="Currency choices">
          {CURRENCIES.map((c) => (
            <button
              key={c}
              type="button"
              className={`btn small${settings.currency === c ? " primary" : ""}`}
              aria-pressed={settings.currency === c}
              onClick={() => void save({ currency: c }, "currency")}
            >
              {c}
            </button>
          ))}
        </div>
      </section>

      <section className="entry span-6 rise" style={{ ["--d" as string]: "140ms" }} aria-label="Excluded accounts">
        <div className="entry-head">
          
          <h2>Excluded accounts</h2>
          {saved === "accounts" && <span className="saved-tick">saved ✓</span>}
        </div>
        {!metaReachable && accounts.length === 0 ? (
          <p className="empty-note" data-testid="accounts-empty">
            Actual is unreachable, so no accounts can be listed. Exclusions will apply once a
            connection is made — nothing is hidden meanwhile.
          </p>
        ) : accounts.length === 0 ? (
          <p className="empty-note" data-testid="accounts-empty">
            No accounts found in Actual. Nothing is excluded.
          </p>
        ) : (
          <ul className="picker-list">
            {accounts.map((a) => (
              <label key={a.id}>
                <input
                  type="checkbox"
                  checked={settings.excludedAccounts.includes(a.id)}
                  onChange={() => {
                    const next = toggle(settings.excludedAccounts, a.id);
                    setSettings((s) => ({ ...s, excludedAccounts: next }));
                    void save({ excludedAccounts: next }, "accounts");
                  }}
                />
                <span>{a.name}</span>
              </label>
            ))}
          </ul>
        )}
        {settings.excludedAccounts.length > 0 && (
          <p className="row-meta">
            Excluded:{" "}
            <span className="mono">{settings.excludedAccounts.length} account(s)</span> — their
            flows leave the rate before any math happens.
          </p>
        )}
      </section>

      <section className="entry span-6 rise" style={{ ["--d" as string]: "210ms" }} aria-label="Excluded categories">
        <div className="entry-head">
          
          <h2>Excluded categories</h2>
          {saved === "categories" && <span className="saved-tick">saved ✓</span>}
        </div>
        {!metaReachable && categories.length === 0 ? (
          <p className="empty-note" data-testid="categories-empty">
            Actual is unreachable, so no categories can be listed. Exclusions will apply once a
            connection is made — nothing is hidden meanwhile.
          </p>
        ) : categories.length === 0 ? (
          <p className="empty-note" data-testid="categories-empty">
            No categories found in Actual. Nothing is excluded.
          </p>
        ) : (
          <ul className="picker-list">
            {categories.map((c) => (
              <label key={c.id}>
                <input
                  type="checkbox"
                  checked={settings.excludedCategories.includes(c.id)}
                  onChange={() => {
                    const next = toggle(settings.excludedCategories, c.id);
                    setSettings((s) => ({ ...s, excludedCategories: next }));
                    void save({ excludedCategories: next }, "categories");
                  }}
                />
                <span>{c.name}</span>
              </label>
            ))}
          </ul>
        )}
        {settings.excludedCategories.length > 0 && (
          <p className="row-meta">
            Excluded:{" "}
            <span className="mono">{settings.excludedCategories.length} categorie(s)</span> — transfers
            are always excluded; these leave too.
          </p>
        )}
      </section>

      <section className="entry span-12 rise accent-top" style={{ ["--d" as string]: "280ms" }} aria-label="Cooldown rules">
        <div className="entry-head">
          
          <h2>Cooling delays</h2>
          {saved === "cooldown" && <span className="saved-tick">saved ✓</span>}
          <span className="sub">price → mandatory wait</span>
        </div>
        <p className="row-meta" style={{ marginTop: 0 }}>
          A wish priced {ruleLabel(settings.cooldownRules[0] ?? { maxPrice: null, days: 0 })} waits out
          its tier before it can be bought. Rules apply top-down; the last open-ended tier catches
          everything above it.
        </p>
        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
        <CooldownEditor
          rules={settings.cooldownRules}
          onChange={(cooldownRules) => {
            setSettings((s) => ({ ...s, cooldownRules }));
            void save({ cooldownRules }, "cooldown");
          }}
        />
      </section>
    </div>
  );
}

function CooldownEditor({
  rules,
  onChange,
}: {
  rules: CooldownRule[];
  onChange: (rules: CooldownRule[]) => void;
}) {
  const [maxPrice, setMaxPrice] = useState("");
  const [days, setDays] = useState("");

  return (
    <div>
      {rules.map((r, i) => (
        <div className="cooldown-grid" key={i}>
          <label className="field">
            <span>{r.maxPrice === null ? "And everything above (no cap)" : "Up to price"}</span>
            <input
              placeholder={r.maxPrice === null ? "no cap" : "max price"}
              inputMode="decimal"
              aria-label={`cooldown tier ${i + 1} max price`}
              onChange={(e) => {
                const v = e.target.value;
                const next = [...rules];
                next[i] = {
                  ...next[i],
                  maxPrice: v === "" ? null : Number(v),
                };
                onChange(next);
              }}
            />
          </label>
          <label className="field">
            <span>Wait (days)</span>
            <input
              value={r.days}
              inputMode="numeric"
              aria-label={`cooldown tier ${i + 1} days`}
              onChange={(e) => {
                const next = [...rules];
                next[i] = { ...next[i], days: Number(e.target.value) || 0 };
                onChange(next);
              }}
            />
          </label>
          <button
            type="button"
            className="btn ghost small"
            aria-label={`remove cooldown tier ${i + 1}`}
            onClick={() => onChange(rules.filter((_, j) => j !== i))}
          >
            Remove
          </button>
        </div>
      ))}
      <form
        className="form-ledger"
        onSubmit={(e) => {
          e.preventDefault();
          onChange([
            ...rules,
            { maxPrice: maxPrice === "" ? null : Number(maxPrice), days: Number(days) || 0 },
          ]);
          setMaxPrice("");
          setDays("");
        }}
      >
        <h3>Add a tier</h3>
        <div className="field-row">
          <label className="field">
            <span>Up to price (blank = no cap)</span>
            <input value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} inputMode="decimal" placeholder="500" />
          </label>
          <label className="field">
            <span>Wait (days)</span>
            <input value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" placeholder="7" required />
          </label>
          <button type="submit" className="btn small">
            Add tier
          </button>
        </div>
      </form>
    </div>
  );
}
