import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { measureMarqueeLoopDistance, useCssMarquee } from "@/hooks/use-css-marquee";

function createMarqueeTrack(itemCount: number, duplicated = true) {
  const track = document.createElement("div");
  const totalItems = duplicated ? itemCount * 2 : itemCount;
  Object.defineProperty(track, "scrollWidth", { value: totalItems * 100, configurable: true });
  Object.defineProperty(track, "offsetHeight", { value: 280, configurable: true });

  for (let index = 0; index < totalItems; index += 1) {
    const item = document.createElement("div");
    item.setAttribute("data-carousel-item", "true");
    Object.defineProperty(item, "offsetLeft", { value: index * 100, configurable: true });
    track.appendChild(item);
  }

  return track;
}

describe("measureMarqueeLoopDistance", () => {
  it("uses the duplicated set boundary when available", () => {
    const track = createMarqueeTrack(3);
    expect(measureMarqueeLoopDistance(track, 3)).toBe(300);
  });

  it("falls back to half the scroll width", () => {
    const track = createMarqueeTrack(3, false);
    expect(measureMarqueeLoopDistance(track, 3)).toBe(150);
  });
});

describe("useCssMarquee", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      }
    );
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible"
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("sets marquee duration from measured loop distance", () => {
    const track = createMarqueeTrack(3);
    const viewport = document.createElement("div");
    const trackRef = { current: track };
    const viewportRef = { current: viewport };

    renderHook(() =>
      useCssMarquee({
        trackRef,
        viewportRef,
        itemCount: 3,
        speedPxPerSec: 60
      })
    );

    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(track.style.getPropertyValue("--marquee-duration")).toBe("5s");
  });

  it("does not configure marquee vars when reduced motion is enabled", () => {
    const track = createMarqueeTrack(3);
    const viewport = document.createElement("div");
    const trackRef = { current: track };
    const viewportRef = { current: viewport };

    renderHook(() =>
      useCssMarquee({
        trackRef,
        viewportRef,
        itemCount: 3,
        reducedMotion: true
      })
    );

    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(track.style.getPropertyValue("--marquee-duration")).toBe("");
  });

  it("pauses animation when the tab is hidden", () => {
    const track = createMarqueeTrack(3);
    const viewport = document.createElement("div");
    const trackRef = { current: track };
    const viewportRef = { current: viewport };

    renderHook(() =>
      useCssMarquee({
        trackRef,
        viewportRef,
        itemCount: 3,
        pausedClassName: "marqueePaused"
      })
    );

    act(() => {
      vi.advanceTimersByTime(50);
    });

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden"
    });

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(track.classList.contains("marqueePaused")).toBe(true);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible"
    });

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(track.classList.contains("marqueePaused")).toBe(false);
  });
});
