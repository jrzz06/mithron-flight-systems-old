import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useResolvedCart } from "@/hooks/use-resolved-cart";
import { useCartPricingStore } from "@/store/cart-pricing";

const persistedItems = [
  {
    productSlug: "pixy-lr",
    bundleId: "standard",
    quantity: 1,
    productName: "Pixy LR",
    bundleName: "Standard configuration",
    image: "/assets/products/pixy.webp"
  }
];

vi.mock("@/store/cart", () => ({
  useCartStore: (selector: (state: { items: typeof persistedItems; isCartSessionReady: boolean }) => unknown) =>
    selector({ items: persistedItems, isCartSessionReady: true })
}));

describe("useResolvedCart", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useCartPricingStore.getState().reset();
  });

  it("keeps persisted display lines when pricing fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "Product pixy-lr is no longer available." }), { status: 409 })
      )
    );

    const { result } = renderHook(() => useResolvedCart());

    await waitFor(() => {
      expect(result.current.isResolving).toBe(false);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.productName).toBe("Pixy LR");
    expect(result.current.items[0]?.unitPrice).toBe(0);
    expect(result.current.error ?? "").toContain("no longer available");
    expect(result.current.pricesPending).toBe(true);
  });
});
