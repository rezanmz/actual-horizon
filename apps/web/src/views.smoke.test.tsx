import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "./views/Dashboard";
import { Goals } from "./views/Goals";
import { Settings } from "./views/Settings";
import { Wishes } from "./views/Wishes";
import {
  fixtureAccounts,
  fixtureCategories,
  fixtureGoals,
  fixtureImpacts,
  fixtureSettings,
  fixtureSnapshots,
  fixtureStats,
  fixtureWishes,
} from "./lib";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Every view renders from contract fixtures with zero network. */
describe("all views smoke", () => {
  it("dashboard shows honesty figures (in/out flows, window, txns)", () => {
    render(
      <Dashboard
        initial={{
          stats: fixtureStats,
          snapshots: fixtureSnapshots,
          goals: fixtureGoals,
          wishes: fixtureWishes,
          impacts: fixtureImpacts,
          health: { ok: true, actual: { version: "26.9.0", reachable: true } },
        }}
      />,
    );
    expect(screen.getAllByText(/180d window/)).toHaveLength(2);
    expect(screen.getByText(/412 txns/)).toBeInTheDocument();
    expect(screen.getAllByTestId("line-chart")).toHaveLength(2);
  });

  it("wishes queue covers inbox + cooling with rounded delays and a live preview", () => {
    const floatImpacts = {
      w1: {
        perGoal: [
          { goalId: "g1", oldDate: "2026-11-10", newDate: "2026-11-18", delayDays: 5.12 },
        ],
        neverGoals: [],
      },
    };
    render(
      <Wishes
        initial={{ wishes: fixtureWishes, goals: fixtureGoals, impacts: floatImpacts }}
      />,
    );
    // Inbox wish is no longer stranded: it sits in the decision queue…
    expect(screen.getByText("Coffee subscription")).toBeInTheDocument();
    // …with the float delay rounded UP for display, in both row and preview.
    // Countdown ceils to whole days (#28): a ~6d timer reads 6d, not 5d 23h.
    expect(screen.getAllByText("6d", { exact: false })).toHaveLength(3);
    expect(screen.getByText(/cools 6d/)).toBeInTheDocument();
    // Clear affordance: every undecided row offers a preview button.
    expect(screen.getAllByRole("button", { name: "Preview impact" })).toHaveLength(2);
    // Preview panel names the goal and the rounded slip.
    expect(screen.getByTestId("impact-preview")).toHaveTextContent("Emergency fund");
    expect(screen.getByTestId("impact-preview")).toHaveTextContent("+6d");
  });

  it("goals render with targets, deadlines, and entry form", () => {
    render(<Goals initial={fixtureGoals} />);
    expect(screen.getByText("Emergency fund")).toBeInTheDocument();
    expect(screen.getByText(/due 2026-12-01/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add goal" })).toBeInTheDocument();
  });

  it("settings render lookback, pickers, cooldown tiers, and currency", () => {
    render(
      <Settings
        initial={{ settings: fixtureSettings, accounts: fixtureAccounts, categories: fixtureCategories, metaReachable: true }}
      />,
    );
    expect(screen.getByRole("group", { name: "Lookback presets" })).toHaveTextContent("180d");
    expect(screen.getByText("Everyday checking")).toBeInTheDocument();
    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(screen.getByLabelText("cooldown tier 3 days")).toHaveValue("30");
    expect(screen.getByRole("group", { name: "Currency choices" })).toHaveTextContent("USD");
  });

  it("settings show graceful empty states when Actual is unreachable", () => {
    render(
      <Settings
        initial={{ settings: fixtureSettings, accounts: [], categories: [], metaReachable: false }}
      />,
    );
    expect(screen.getByTestId("accounts-empty")).toHaveTextContent("Actual is unreachable");
    expect(screen.getByTestId("categories-empty")).toHaveTextContent("Actual is unreachable");
    // Lookback + cooldown editors still work without metadata.
    expect(screen.getByRole("group", { name: "Lookback presets" })).toBeInTheDocument();
  });

  it("settings lookback save PUTs a partial and confirms", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const patch = JSON.parse(String(init?.body ?? "{}"));
      return Response.json({ ...fixtureSettings, ...patch });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <MemoryRouter>
        <Settings
          initial={{ settings: fixtureSettings, accounts: [], categories: [], metaReachable: false }}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "90d" }));
    await waitFor(() => expect(screen.getByText("saved ✓")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/settings",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ lookbackDays: 90 }) }),
    );
  });

  it("settings cooldown tiers display values and PUT numeric edits", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const patch = JSON.parse(String(init?.body ?? "{}"));
      return Response.json({ ...fixtureSettings, ...patch });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <MemoryRouter>
        <Settings
          initial={{ settings: fixtureSettings, accounts: [], categories: [], metaReachable: false }}
        />
      </MemoryRouter>,
    );
    // Saved tiers are visible (max-price inputs are value-bound).
    expect(screen.getByLabelText("cooldown tier 1 max price")).toHaveValue("50");
    fireEvent.change(screen.getByLabelText("cooldown tier 1 max price"), { target: { value: "75" } });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/settings",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            cooldownRules: [
              { maxPrice: 75, days: 3 },
              { maxPrice: 500, days: 7 },
              { maxPrice: null, days: 30 },
            ],
          }),
        }),
      ),
    );
  });
});
