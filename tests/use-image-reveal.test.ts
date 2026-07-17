import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useImageReveal } from "@/hooks/use-image-reveal";

describe("useImageReveal", () => {
  it("starts unrevealed for a new source", () => {
    const { result } = renderHook(({ src }) => useImageReveal(src), {
      initialProps: { src: "/media/a.webp" }
    });

    expect(result.current.isRevealed).toBe(false);
  });

  it("reveals when handleReveal is called", () => {
    const { result } = renderHook(() => useImageReveal("/media/a.webp"));

    act(() => {
      result.current.handleReveal();
    });

    expect(result.current.isRevealed).toBe(true);
  });

  it("reveals immediately when image is already complete", () => {
    const { result } = renderHook(() => useImageReveal("/media/a.webp"));
    const image = {
      complete: true,
      naturalWidth: 1200
    } as HTMLImageElement;

    act(() => {
      result.current.revealFromImage(image);
    });

    expect(result.current.isRevealed).toBe(true);
  });

  it("resets reveal state when src changes", () => {
    const { result, rerender } = renderHook(({ src }) => useImageReveal(src), {
      initialProps: { src: "/media/a.webp" }
    });

    act(() => {
      result.current.handleReveal();
    });
    expect(result.current.isRevealed).toBe(true);

    rerender({ src: "/media/b.webp" });
    expect(result.current.isRevealed).toBe(false);
  });

  it("does not reveal from incomplete image element", () => {
    const { result } = renderHook(() => useImageReveal("/media/a.webp"));
    const image = {
      complete: false,
      naturalWidth: 0
    } as HTMLImageElement;

    act(() => {
      result.current.revealFromImage(image);
    });

    expect(result.current.isRevealed).toBe(false);
  });
});
