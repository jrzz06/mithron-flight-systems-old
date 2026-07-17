import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const subscribeMock = vi.fn();

vi.mock("@/lib/control-plane/shared-enterprise-realtime", () => ({
  subscribeSharedEnterpriseRealtime: subscribeMock
}));

describe("shared live sync coordinator", () => {
  beforeEach(() => {
    vi.resetModules();
    subscribeMock.mockImplementation((_scope, listener) => {
      listener.onEvent?.({
        table: "orders",
        eventType: "UPDATE",
        record: { id: "1" }
      });
      return () => undefined;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces multiple consumers into one revalidation per table", async () => {
    vi.useFakeTimers();
    const { subscribeControlPlaneLiveSync } = await import("@/lib/control-plane/shared-live-sync-coordinator");

    const routerRefresh = vi.fn();
    subscribeControlPlaneLiveSync("admin", () => true, { routerRefresh });
    subscribeControlPlaneLiveSync("admin", (table) => table === "orders", { routerRefresh });

    await vi.advanceTimersByTimeAsync(150);

    expect(routerRefresh).toHaveBeenCalledTimes(1);
  });

  it("skips router refresh when a local mutation flush happened recently", async () => {
    vi.useFakeTimers();
    const {
      markControlPlaneLiveSyncFlush,
      subscribeControlPlaneLiveSync
    } = await import("@/lib/control-plane/shared-live-sync-coordinator");

    markControlPlaneLiveSyncFlush();

    const routerRefresh = vi.fn();
    subscribeControlPlaneLiveSync("admin", () => true, { routerRefresh });

    await vi.advanceTimersByTimeAsync(150);

    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("defers router refresh while the document is hidden", async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden"
    });

    const { subscribeControlPlaneLiveSync } = await import("@/lib/control-plane/shared-live-sync-coordinator");
    const routerRefresh = vi.fn();
    subscribeControlPlaneLiveSync("admin", () => true, { routerRefresh });

    await vi.advanceTimersByTimeAsync(150);
    expect(routerRefresh).not.toHaveBeenCalled();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible"
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);

    expect(routerRefresh).toHaveBeenCalledTimes(1);
  });
});
