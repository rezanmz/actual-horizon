import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LineChart } from "./components/LineChart";

afterEach(cleanup);

const svgOf = () => screen.getByTestId("line-chart") as unknown as SVGSVGElement;

const labels = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"];
const series = [
  { label: "spot", color: "#111111", values: [100, 200, null, 400] },
  { label: "avg", color: "#b23a1d", values: [90, 180, 270, 360] },
];

function moveOver(svg: SVGSVGElement, clientX: number) {
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
    left: 0,
    width: 560,
    top: 0,
    height: 170,
    right: 560,
    bottom: 170,
    x: 0,
    y: 0,
    toJSON: () => {},
  });
  fireEvent.mouseMove(svg, { clientX });
}

describe("LineChart hover readout (#30)", () => {
  it("shows date plus per-series values at the nearest point", () => {
    render(<LineChart series={series} labels={labels} formatTick={(v) => `$${Math.round(v)}`} />);
    const svg = svgOf();
    expect(screen.queryByTestId("chart-tip")).toBeNull();
    // x(2) = 8 + 2 * (560 - 18) / 3 = 369.3 → aim there; spot is null so only avg shows.
    moveOver(svg, 369);
    const tip = screen.getByTestId("chart-tip");
    expect(tip).toHaveTextContent("2026-09-03");
    expect(tip).toHaveTextContent("avg");
    expect(tip).toHaveTextContent("$270");
    expect(within(tip).queryByText("spot")).toBeNull();
  });

  it("clears the readout on mouse leave", () => {
    render(<LineChart series={series} labels={labels} />);
    const svg = svgOf();
    moveOver(svg, 10);
    expect(screen.getByTestId("chart-tip")).toHaveTextContent("2026-09-01");
    fireEvent.mouseLeave(svg);
    expect(screen.queryByTestId("chart-tip")).toBeNull();
  });
});
