import { describe, expect, it, vi, afterEach } from "vitest";
import { useCartPricingStore } from "@/store/cart-pricing";

const sampleItems = [
  {
    productSlug: "pixy-lr",
    bundleId: "standard",
    quantity: 1
  }
];

describe("cart pricing store", () => {
  afterEach(() => {
    useCartPricingStore.getState().reset();
    vi.unstubAllGlobals();
  });

  it("deduplicates in-flight pricing requests for the same cart payload", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          lines: [
            {
              productSlug: "pixy-lr",
              bundleId: "standard",
              quantity: 1,
              productName: "Pixy LR",
              bundleName: "Standard configuration",
              unitPrice: 256703.24,
              compareAt: null,
              image: "/assets/products/pixy.webp"
            }
          ],
          subtotal: 256703.24,
          taxTotal: 0,
          total: 256703.24
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const store = useCartPricingStore.getState();
    await Promise.all([
      store.fetchPricing(sampleItems),
      store.fetchPricing(sampleItems)
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useCartPricingStore.getState().snapshot.total).toBe(256703.24);
  });
});
