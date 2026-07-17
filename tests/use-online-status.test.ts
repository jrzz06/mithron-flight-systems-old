import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useOnlineStatus } from "@/hooks/use-online-status";

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => value
  });
}

describe("useOnlineStatus", () => {
  const originalOnLine = Object.getOwnPropertyDescriptor(window.navigator, "onLine");

  beforeEach(() => {
    setNavigatorOnline(true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalOnLine) {
      Object.defineProperty(window.navigator, "onLine", originalOnLine);
    }
  });

  it("defaults to online and stays online when navigator reports online", () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
  });

  it("does not flip offline on a brief offline event that recovers", async () => {
    const { result } = renderHook(() => useOnlineStatus());

    await act(async () => {
      setNavigatorOnline(false);
      window.dispatchEvent(new Event("offline"));
    });

    expect(result.current).toBe(true);

    await act(async () => {
      setNavigatorOnline(true);
      window.dispatchEvent(new Event("online"));
    });

    expect(result.current).toBe(true);
  });

  it("marks offline only after a confirmed failed probe", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );

    const { result } = renderHook(() => useOnlineStatus());

    await act(async () => {
      setNavigatorOnline(false);
      window.dispatchEvent(new Event("offline"));
    });

    await waitFor(
      () => {
        expect(result.current).toBe(false);
      },
      { timeout: 4000 }
    );
  });

  it("recovers immediately on the online event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );

    const { result } = renderHook(() => useOnlineStatus());

    await act(async () => {
      setNavigatorOnline(false);
      window.dispatchEvent(new Event("offline"));
    });

    await waitFor(
      () => {
        expect(result.current).toBe(false);
      },
      { timeout: 4000 }
    );

    await act(async () => {
      setNavigatorOnline(true);
      window.dispatchEvent(new Event("online"));
    });

    expect(result.current).toBe(true);
  });

  it("stays online when navigator is offline but a same-origin probe succeeds", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useOnlineStatus());

    await act(async () => {
      setNavigatorOnline(false);
      window.dispatchEvent(new Event("offline"));
    });

    await waitFor(
      () => {
        expect(fetchMock).toHaveBeenCalled();
      },
      { timeout: 4000 }
    );

    expect(result.current).toBe(true);
  });
});
