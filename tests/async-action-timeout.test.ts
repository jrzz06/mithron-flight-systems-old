import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionTimeoutError, raceWithTimeout } from "@/lib/fetch-with-timeout";
import { wrapServerAction } from "@/hooks/use-async-action";

describe("raceWithTimeout / wrapServerAction", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves when the action finishes before the timeout", async () => {
    const result = await raceWithTimeout(Promise.resolve("ok"), 1_000, "Test");
    expect(result).toBe("ok");
  });

  it("rejects with ActionTimeoutError when the action hangs", async () => {
    vi.useFakeTimers();
    const hung = new Promise<string>(() => {
      /* never settles */
    });
    const pending = raceWithTimeout(hung, 50, "Hung action");
    const assertion = expect(pending).rejects.toMatchObject({
      name: "ActionTimeoutError",
      message: expect.stringContaining("Hung action timed out")
    });
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });

  it("wrapServerAction settles hung server actions so pending can clear", async () => {
    vi.useFakeTimers();
    const hungAction = async () =>
      new Promise<string>(() => {
        /* never settles */
      });
    const wrapped = wrapServerAction(hungAction, { timeoutMs: 40, label: "Quick restock" });
    const pending = wrapped();
    const assertion = expect(pending).rejects.toBeInstanceOf(ActionTimeoutError);
    await vi.advanceTimersByTimeAsync(40);
    await assertion;
  });
});
