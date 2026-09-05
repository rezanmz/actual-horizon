import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Dashboard } from "./views/Dashboard";
import {
  fixtureGoals,
  fixtureImpacts,
  fixtureSnapshots,
  fixtureStats,
  fixtureWishes,
} from "./lib";

/** Smoke test: all four dashboard panels render from contract fixtures (no network). */
describe("dashboard smoke", () => {
  it("renders spot/avg, rate, goals, and cooling panels from fixtures", () => {
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

    expect(screen.getByTestId("spot-panel")).toBeInTheDocument();
    expect(screen.getByTestId("rate-panel")).toBeInTheDocument();
    expect(screen.getByTestId("goals-panel")).toBeInTheDocument();
    expect(screen.getByTestId("cooling-panel")).toBeInTheDocument();

    // Spot vs avg chart lines + rate trend chart render SVGs.
    expect(screen.getAllByTestId("line-chart")).toHaveLength(2);

    // Goals with progress + dates (funded goals read "funded", not "0 days →").
    expect(screen.getByText("Emergency fund")).toBeInTheDocument();
    expect(screen.getByText(/77 days →/)).toBeInTheDocument();
    expect(screen.getByText("funded")).toBeInTheDocument();

    // Cooling queue with rounded delay pill.
    expect(screen.getByText("Headphones")).toBeInTheDocument();
    expect(screen.getByText("+8d slip")).toBeInTheDocument();

    // Health badge from the contract shape.
    expect(screen.getByText(/Actual 26\.9\.0/)).toBeInTheDocument();
  });
});
