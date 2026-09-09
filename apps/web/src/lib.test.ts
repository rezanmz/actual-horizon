import { describe, expect, it, vi } from "vitest";
import { formatCountdown } from "./lib";

describe("formatCountdown (#28)", () => {
  it("ceils fresh multi-day timers to the rule days", () => {
    const sevenDaysMinusEvening = 7 * 86_400_000 - 19.5 * 3_600_000;
    expect(formatCountdown(sevenDaysMinusEvening)).toBe("7d");
  });

  it("ceils partial days up", () => {
    expect(formatCountdown(6 * 86_400_000 + 4 * 3_600_000)).toBe("7d");
    expect(formatCountdown(6 * 86_400_000)).toBe("6d");
  });

  it("keeps hour/minute precision under a day", () => {
    expect(formatCountdown(23 * 3_600_000 + 59 * 60_000)).toBe("23h 59m");
    expect(formatCountdown(45 * 60_000)).toBe("45m");
    expect(formatCountdown(0)).toBe("ready now");
    expect(formatCountdown(-5)).toBe("ready now");
  });
});

describe("req empty bodies (#28)", () => {
  it("resolves undefined on 204 No Content", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));
    const { deleteWish } = await import("./api");
    await expect(deleteWish("w1")).resolves.toBeUndefined();
    fetchSpy.mockRestore();
  });
});

describe("chart timeframes (#37)", () => {
  it("formats day precision on short ranges, month-year on long ones", async () => {
    const { formatXLabel } = await import("./lib");
    expect(formatXLabel("2026-09-05", 30)).toBe("Sep 5");
    expect(formatXLabel("2026-09-05", 90)).toBe("Sep 5");
    expect(formatXLabel("2026-09-05", 365)).toBe("Sep ’26");
  });

  it("keeps daily points on short ranges, buckets weekly and monthly", async () => {
    const { bucketSnapshots } = await import("./lib");
    const mk = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        date: `2026-01-${String(i + 1).padStart(2, "0")}`,
        spot: 100 + i,
        avg: 100 + i,
        rate: 10 as number | null,
      }));
    expect(bucketSnapshots(mk(30), 30)).toHaveLength(30);
    // 90 days → weekly buckets of 7.
    expect(bucketSnapshots(mk(90), 90)).toHaveLength(13);
    // 365-day span in one month prefix → monthly buckets.
    const monthly = mk(65).map((s, i) => ({ ...s, date: `2026-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-15` }));
    expect(bucketSnapshots(monthly, 365).length).toBeLessThan(monthly.length);
  });
});
