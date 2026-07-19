import { describe, expect, it } from "vitest";
import {
  clearPerfSamples,
  getPerfSamples,
  markActionEnd,
  markActionStart,
  summarizePerfSamples,
  timedAction
} from "@/lib/perf/action-timer";

describe("action timer harness", () => {
  it("records start/end samples when timing is enabled", async () => {
    const prev = process.env.PERF_ACTION_TIMING;
    process.env.PERF_ACTION_TIMING = "1";
    clearPerfSamples();
    markActionStart("test-action");
    await new Promise((r) => setTimeout(r, 5));
    const ms = markActionEnd("test-action", { panel: "customer", ok: true });
    expect(ms).toBeGreaterThanOrEqual(0);
    expect(getPerfSamples().length).toBe(1);
    const summary = summarizePerfSamples("test-action");
    expect(summary?.count).toBe(1);
    process.env.PERF_ACTION_TIMING = prev;
  });

  it("timedAction returns fn result and records on success", async () => {
    const prev = process.env.PERF_ACTION_TIMING;
    process.env.PERF_ACTION_TIMING = "1";
    clearPerfSamples();
    const value = await timedAction("timed-ok", async () => 42, { panel: "shared" });
    expect(value).toBe(42);
    expect(getPerfSamples().some((s) => s.action === "timed-ok" && s.ok)).toBe(true);
    process.env.PERF_ACTION_TIMING = prev;
  });
});
