import { describe, expect, it } from "vitest";
import { deriveProductSku } from "@/services/product-inventory-sync";

describe("inventory metrics helpers", () => {
  it("keeps canonical SKU derivation aligned with inventory rows", () => {
    expect(deriveProductSku("survey-drone-pro")).toBe("SURVEY-DRONE-PRO");
    expect(deriveProductSku("survey-drone-pro")).toBe(deriveProductSku("survey-drone-pro"));
  });
});

describe("inventory metrics module", () => {
  it("exports product and inventory metric loaders", async () => {
    const metrics = await import("@/services/inventory-metrics");
    expect(typeof metrics.getProductCatalogMetrics).toBe("function");
    expect(typeof metrics.getInventoryStockMetrics).toBe("function");
    expect(typeof metrics.assertInventoryProductParity).toBe("function");
  });
});
