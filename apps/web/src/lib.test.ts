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
