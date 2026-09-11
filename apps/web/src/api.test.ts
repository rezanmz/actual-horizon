import { afterEach, describe, expect, it, vi } from "vitest";
import { awaitSyncDone } from "./api";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("awaitSyncDone (#46)", () => {
  it("polls GET /api/sync until the job leaves running", async () => {
    const queue: unknown[] = [
      { status: "running", days: 7 },
      { status: "running", days: 7 },
      { status: "done", days: 7, syncedAt: "2026-09-11T00:00:00.000Z", count: 7 },
    ];
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => Response.json(queue.shift() ?? { status: "done" }));
    const done = await awaitSyncDone(5000, 1);
    expect(done).toMatchObject({ status: "done", count: 7 });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("/api/sync");
  });

  it("rejects with the job error instead of hanging", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ status: "error", error: "actual sync failed" }),
    );
    await expect(awaitSyncDone(5000, 1)).rejects.toThrow("actual sync failed");
  });
});
