import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TotalDelay, goalSlip } from "./components/TotalDelay";
import type { Goal, Impact, Snapshot, Wish } from "./types";

afterEach(cleanup);

const goals: Goal[] = [
  { id: "g1", name: "Fund", target: 10000, priority: 1 },
  { id: "g2", name: "Trip", target: 2000, priority: 2 },
];

const wish = (over: Partial<Wish> & { id: string }): Wish => ({
  name: "w",
  price: 100,
  cadence: "one-off",
  status: "cooling",
  addedAt: "2026-09-01T00:00:00.000Z",
  ...over,
});

const impact = (delays: Record<string, number>): Impact => ({
  perGoal: Object.entries(delays).map(([goalId, delayDays]) => ({
    goalId,
    oldDate: "2026-10-01",
    newDate: "2026-10-05",
    delayDays,
  })),
  neverGoals: [],
});

const snap = (date: string, avg: number, rate: number | null): Snapshot => ({
  date,
  spot: avg,
  avg,
  rate,
});

const renderPanel = (wishes: Wish[], impacts: Record<string, Impact>, snapshots: Snapshot[] = []) =>
  render(
    <TotalDelay goals={goals} wishes={wishes} impacts={impacts} snapshots={snapshots} avg={0} rate={100} />,
  );

describe("TotalDelay (#32)", () => {
  it("sums pushes across undecided wishes and ignores settled ones", () => {
    const wishes = [
      wish({ id: "w1", status: "cooling" }),
      wish({ id: "w2", status: "inbox" }),
      wish({ id: "w3", status: "bought" }),
    ];
    const impacts = {
      w1: impact({ g1: 5.2, g2: 1.1 }),
      w2: impact({ g1: 2.3 }),
      w3: impact({ g1: 100 }),
    };
    renderPanel(wishes, impacts);
    // g1: ceil(5.2 + 2.3) = 8, bought wish excluded; g2: ceil(1.1) = 2.
    expect(screen.getByText("Fund").closest("li")).toHaveTextContent("+8d");
    expect(screen.getByText("Trip").closest("li")).toHaveTextContent("+2d");
  });

  it("shows arrival shift from the current projection", () => {
    const wishes = [wish({ id: "w1" })];
    const impacts = { w1: impact({ g1: 3 }) };
    // avg 0, rate 100 → g1 arrival in 100d; pushed +3d.
    renderPanel(wishes, impacts);
    const row = screen.getByText("Fund").closest("li");
    expect(row).toHaveTextContent("+3d");
  });

  it("handles empty goals", () => {
    render(
      <TotalDelay goals={[]} wishes={[]} impacts={{}} snapshots={[]} avg={0} rate={100} />,
    );
    expect(screen.getByText(/add a goal/i)).toBeInTheDocument();
  });

  it("reports building history under 30d of snapshots", () => {
    const wishes = [wish({ id: "w1" })];
    renderPanel(wishes, { w1: impact({ g1: 3 }) }, [snap("2026-09-01", 0, 100)]);
    expect(screen.getByText("Fund").closest("li")).toHaveTextContent("building history");
  });
});

describe("goalSlip retrospective (#32)", () => {
  it("measures arrival slip between oldest and latest snapshots", () => {
    // Target 10000: old avg 0 @ rate 100 → 100d; 40d later avg 2000 @ 100 → 80d.
    // Slip = 80 - 100 + 40 = +20d later.
    const snaps = [snap("2026-07-27", 0, 100), snap("2026-09-05", 2000, 100)];
    expect(goalSlip(10000, snaps)).toEqual({ kind: "slipped", days: 20, spanDays: 40 });
  });

  it("reports gains when the pace improved", () => {
    // Old: 100d out; 40d later avg 5000 → 50d out. Slip = 50 - 100 + 40 = -10.
    const snaps = [snap("2026-07-27", 0, 100), snap("2026-09-05", 5000, 100)];
    expect(goalSlip(10000, snaps)).toEqual({ kind: "gained", days: 10, spanDays: 40 });
  });

  it("returns null without 30d of history or usable numbers", () => {
    expect(goalSlip(10000, [snap("2026-09-01", 0, 100)])).toBeNull();
    expect(goalSlip(10000, [])).toBeNull();
    expect(goalSlip(10000, [snap("2026-07-27", 0, null), snap("2026-09-05", 0, 100)])).toBeNull();
  });
});
