import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("warehouse legacy route retirement", () => {
  it("retires fragmented picking, packing, dispatch, stock, and settings routes in favor of unified fulfillment", () => {
    const fulfillmentPage = source("app/warehouse/fulfillment/page.tsx");
    const fulfillmentDetailPage = source("app/warehouse/fulfillment/[id]/page.tsx");
    const navConfig = source("components/platform/nav-config.ts");
    const actions = source("app/warehouse/actions.ts");

    expect(fulfillmentPage).toContain("getWarehouseSnapshot");
    expect(fulfillmentPage).toContain("data-warehouse-fulfillment-route");
    expect(fulfillmentDetailPage).toContain("dispatchWarehouseOrderFormAction");
    expect(fulfillmentDetailPage).not.toContain("receiveWarehouseOrderFormAction");
    expect(navConfig).toContain("/warehouse/fulfillment");
    expect(navConfig).not.toContain("/warehouse/picking");
    expect(navConfig).not.toContain("/warehouse/inventory");
    expect(navConfig).not.toContain("/warehouse/settings");
    expect(actions).toContain('revalidatePath("/warehouse/fulfillment")');
    expect(actions).toContain("receiveWarehouseOrderFormAction");
    expect(actions).toContain("cancelWarehouseOrderFormAction");
  });
});
