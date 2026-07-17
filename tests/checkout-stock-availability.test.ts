import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CheckoutStockVerificationError,
  verifyCheckoutStockAvailability
} from "@/services/checkout-stock";

const env = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  DEFAULT_WAREHOUSE_CODE: "IN-WEST-01"
};

function mockFetch(handler: (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>) {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
    const target = String(url);
    if (target.includes("warehouse_configuration")) {
      return { ok: false, json: async () => [] };
    }
    return handler(target);
  }));
}

describe("verifyCheckoutStockAvailability", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fails when warehouse stock is missing even if catalog inventory could exist elsewhere", async () => {
    mockFetch(async () => ({
      ok: true,
      json: async () => []
    }));

    await expect(
      verifyCheckoutStockAvailability([{ productSlug: "agri-drone-x1", quantity: 1 }], env)
    ).rejects.toBeInstanceOf(CheckoutStockVerificationError);

    await expect(
      verifyCheckoutStockAvailability([{ productSlug: "agri-drone-x1", quantity: 1 }], env)
    ).rejects.toMatchObject({
      warehouseCode: "IN-WEST-01",
      issues: [
        {
          productSlug: "agri-drone-x1",
          requested: 1,
          available: 0,
          warehouseCode: "IN-WEST-01",
          hasWarehouseRow: false
        }
      ]
    });
  });

  it("passes when checkout warehouse has enough available quantity", async () => {
    mockFetch(async () => ({
      ok: true,
      json: async () => [{ product_slug: "agri-drone-x1", quantity: 4, reserved_quantity: 0 }]
    }));

    await expect(
      verifyCheckoutStockAvailability([{ productSlug: "agri-drone-x1", quantity: 2 }], env)
    ).resolves.toBeUndefined();
  });

  it("aggregates duplicate cart lines for the same slug", async () => {
    mockFetch(async () => ({
      ok: true,
      json: async () => [{ product_slug: "agri-drone-x1", quantity: 3, reserved_quantity: 0 }]
    }));

    await expect(
      verifyCheckoutStockAvailability(
        [
          { productSlug: "agri-drone-x1", quantity: 2 },
          { productSlug: "agri-drone-x1", quantity: 2 }
        ],
        env
      )
    ).rejects.toMatchObject({
      issues: [{ productSlug: "agri-drone-x1", requested: 4, available: 3 }]
    });
  });
});
