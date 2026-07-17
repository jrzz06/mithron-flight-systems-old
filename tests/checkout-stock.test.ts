import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fulfillReservedStock,
  releaseCheckoutStock,
  reserveCheckoutStock,
  resolveCheckoutStockSkus,
  verifyCheckoutStockAvailability
} from "@/services/checkout-stock";

const env = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  DEFAULT_WAREHOUSE_CODE: "IN-WEST-01"
};

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<{ ok: boolean; json: () => Promise<unknown> }>) {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string, init?: RequestInit) => handler(String(url), init)));
}

describe("checkout stock contracts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves checkout SKUs from inventory", async () => {
    mockFetch(async () => ({
      ok: true,
      json: async () => [{ product_slug: "ag10", sku: "AG10-STD", quantity: 5 }]
    }));

    const items = await resolveCheckoutStockSkus([{ productSlug: "ag10", quantity: 2 }], env);
    expect(items).toEqual([{ productSlug: "ag10", quantity: 2, sku: "AG10-STD" }]);
    const stockCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(([callUrl]) => String(callUrl).includes("/inventory?"));
    expect(stockCall).toBeTruthy();
  });

  it("calls reserve_checkout_stock RPC for soft-reserve", async () => {
    mockFetch(async (url) => {
      if (url.includes("/rpc/reserve_checkout_stock")) {
        return { ok: true, json: async () => ({ skipped: false, rows_reserved: 1 }) };
      }
      return { ok: true, json: async () => [] };
    });

    const result = await reserveCheckoutStock("order-1", [{ productSlug: "ag10", quantity: 1, sku: "AG10-STD" }], env);
    expect(result).toEqual({ skipped: false, rows_reserved: 1 });
    const rpcCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(([callUrl]) => String(callUrl).includes("/rpc/reserve_checkout_stock"));
    expect(rpcCall).toBeTruthy();
    const [, init] = rpcCall ?? [];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      p_order_id: "order-1",
      p_warehouse_code: "IN-WEST-01",
      p_items: [{ product_slug: "ag10", quantity: 1, sku: "AG10-STD" }]
    });
  });

  it("calls release_checkout_stock RPC when cancelling/expiring checkout", async () => {
    mockFetch(async (url) => {
      if (url.includes("/rpc/release_checkout_stock")) {
        return { ok: true, json: async () => ({ skipped: false, rows_released: 1 }) };
      }
      return { ok: true, json: async () => [] };
    });

    const result = await releaseCheckoutStock("order-1", env);
    expect(result).toEqual({ skipped: false, rows_released: 1 });
    const rpcCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(([callUrl]) => String(callUrl).includes("/rpc/release_checkout_stock"));
    expect(rpcCall).toBeTruthy();
    const [, init] = rpcCall ?? [];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      p_order_id: "order-1",
      p_warehouse_code: "IN-WEST-01"
    });
  });

  it("routes fulfillment through deduct_order_inventory_on_fulfillment RPC", async () => {
    mockFetch(async () => ({
      ok: true,
      json: async () => ({ order_id: "order-1", rows_deducted: 1 })
    }));

    await fulfillReservedStock("order-1", "actor-1", env);
    const rpcCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(([callUrl]) => String(callUrl).includes("/rpc/deduct_order_inventory_on_fulfillment"));
    const [, init] = rpcCall ?? [];
    expect(rpcCall).toBeTruthy();
    expect(JSON.parse(String(init?.body))).toMatchObject({
      p_order_id: "order-1",
      p_actor_id: "actor-1"
    });
  });

  it("aggregates duplicate slug quantities before stock verification", async () => {
    mockFetch(async () => ({
      ok: true,
      json: async () => [{ product_slug: "ag10", sku: "AG10-STD", quantity: 100 }]
    }));

    await expect(
      verifyCheckoutStockAvailability([
        { productSlug: "ag10", quantity: 60 },
        { productSlug: "ag10", quantity: 50 }
      ], env)
    ).rejects.toThrow(/Insufficient stock for ag10\. Requested 110, available 100/);

    await expect(
      verifyCheckoutStockAvailability([
        { productSlug: "ag10", quantity: 60 },
        { productSlug: "ag10", quantity: 40 }
      ], env)
    ).resolves.toBeUndefined();
  });
});
