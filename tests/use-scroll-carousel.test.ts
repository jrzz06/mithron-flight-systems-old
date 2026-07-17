import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScrollCarousel } from "@/hooks/use-scroll-carousel";

function createScrollContainer() {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientWidth", { value: 300, configurable: true });

  for (let index = 0; index < 3; index += 1) {
    const item = document.createElement("div");
    item.setAttribute("data-carousel-item", "true");
    Object.defineProperty(item, "offsetWidth", { value: 100, configurable: true });
    container.appendChild(item);
  }

  container.scrollTo = vi.fn((options?: ScrollToOptions | number, _y?: number) => {
    const left = typeof options === "object" ? options?.left : options;
    container.scrollLeft = left ?? 0;
  }) as typeof container.scrollTo;

  return container;
}

describe("useScrollCarousel autoplay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      return setTimeout(() => callback(performance.now()), 0) as unknown as number;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      clearTimeout(id);
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      }
    );
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      columnGap: "0",
      gap: "0"
    } as CSSStyleDeclaration);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("advances on interval when autoPlay is enabled", () => {
    const container = createScrollContainer();
    const scrollRef = { current: container };

    const { result } = renderHook(() =>
      useScrollCarousel({
        itemCount: 3,
        scrollRef,
        autoPlay: true,
        autoPlayIntervalMs: 5000,
        loop: true
      })
    );

    expect(result.current.activeIndex).toBe(0);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.activeIndex).toBe(1);
    expect(container.scrollTo).toHaveBeenCalled();
  });

  it("loops from last slide back to first", () => {
    const container = createScrollContainer();
    const scrollRef = { current: container };

    const { result } = renderHook(() =>
      useScrollCarousel({
        itemCount: 3,
        scrollRef,
        autoPlay: false,
        loop: true
      })
    );

    act(() => {
      result.current.scrollToIndex(2);
    });
    act(() => {
      result.current.scrollNext();
    });

    expect(result.current.activeIndex).toBe(0);
  });

  it("does not auto-advance when paused or reduced motion is enabled", () => {
    const container = createScrollContainer();
    const scrollRef = { current: container };

    const paused = renderHook(() =>
      useScrollCarousel({
        itemCount: 3,
        scrollRef,
        autoPlay: true,
        autoPlayIntervalMs: 5000,
        isPaused: true
      })
    );

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(paused.result.current.activeIndex).toBe(0);

    paused.unmount();

    const reduced = renderHook(() =>
      useScrollCarousel({
        itemCount: 3,
        scrollRef,
        autoPlay: true,
        autoPlayIntervalMs: 5000,
        reducedMotion: true
      })
    );

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(reduced.result.current.activeIndex).toBe(0);
  });
});
