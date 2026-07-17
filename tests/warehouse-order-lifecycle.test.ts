import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi, afterEach } from "vitest";
import { getActiveWarehouseCodes, assertValidWarehouseCode } from "@/services/warehouses";
import { canTransitionOrderStatus } from "@/services/orders";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const env = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  DEFAULT_WAREHOUSE_CODE: "IN-WEST-01"
};

describe("warehouse order lifecycle hardening", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses optimistic locking when updating warehouse order lifecycle", () => {
    const actions = source("app/warehouse/actions.ts");
    expect(actions).toContain("readExpectedUpdatedAt(formData");
    expect(actions).toContain("{ expectedUpdatedAt }");
    expect(actions).toContain("updateWarehouseOrderLifecycleFormAction");
  });

  it("validates warehouse codes against active warehouses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { code: "IN-WEST-01", name: "West", is_active: true },
        { code: "IN-EAST-01", name: "East", is_active: true }
      ]
    }));

    await expect(assertValidWarehouseCode("IN-WEST-01", env)).resolves.toBe("IN-WEST-01");
    await expect(assertValidWarehouseCode("UNKNOWN", env)).rejects.toThrow(/Unknown warehouse_code/i);
    await expect(getActiveWarehouseCodes(env)).resolves.toEqual(["IN-WEST-01", "IN-EAST-01"]);
  });

  it("prevents duplicate same-status fulfillment transitions at form layer", () => {
    const forms = source("services/enterprise-admin-forms.ts");
    expect(forms).toContain("assertOrderFulfillmentTransition");
  });

  it("does not write deprecated orders.items JSONB in warehouse order creation", () => {
    const actions = source("app/warehouse/actions.ts");
    expect(actions).not.toContain("items: draft.order.items");
  });

  it("supports refunded terminal order status in lifecycle transitions", () => {
    expect(canTransitionOrderStatus("paid", "refunded")).toBe(true);
  });
});
