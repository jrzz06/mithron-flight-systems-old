import { describe, expect, it } from "vitest";
import { buildProductReconcileReport } from "@/lib/product-reconcile/audit-catalog";
import type { WixProductSnapshot } from "@/lib/wix/catalog-client";
import { extractRichProductContent } from "@/lib/wix/catalog-rich";
import { pickCanonicalSlug, buildWixPatch } from "@/lib/product-reconcile/score-canonical";

const wixProduct: WixProductSnapshot = {
  wix_product_id: "w1",
  wix_slug: "10l-agri-drone",
  name: "10L Agri Drone",
  price: 341000,
  compare_at: null,
  currency: "INR",
  sku: null,
  cost_of_goods: null,
  description_plain: "Canonical Wix description",
  source_url: "https://www.mithron.co/product-page/10l-agri-drone",
  source_catalog_id: "mithron-10l-agri-drone",
  source_fingerprint: "10lagridrone",
  category: "Agri Drones",
  media_urls: [],
  visible: true,
  updated_at: "2026-06-23T00:00:00.000Z",
  rich: extractRichProductContent({ name: "10L Agri Drone" }, "Agri Drones", [])
};

describe("product reconcile scoring", () => {
  it("prefers rows with orders and source catalog linkage", () => {
    const canonical = pickCanonicalSlug([
      {
        row: {
          slug: "duplicate-a",
          name: "10L Agri Drone Copy",
          source_catalog_id: null,
          workflow_status: "published",
          is_visible: true
        },
        signals: {
          slug: "duplicate-a",
          hasPrimaryMedia: false,
          hasValidImage: false,
          orderItemCount: 0,
          warehouseStockCount: 0,
          inventoryCount: 0,
          seoFieldCount: 0
        },
        wixMatch: null
      },
      {
        row: {
          slug: "source-10l-agri-drone",
          name: "10L Agri Drone",
          source_catalog_id: "mithron-10l-agri-drone",
          workflow_status: "published",
          is_visible: true,
          image: { src: "https://cdn.example.com/product.png" }
        },
        signals: {
          slug: "source-10l-agri-drone",
          hasPrimaryMedia: true,
          hasValidImage: true,
          orderItemCount: 2,
          warehouseStockCount: 1,
          inventoryCount: 1,
          seoFieldCount: 2
        },
        wixMatch: wixProduct
      }
    ]);

    expect(canonical).toBe("source-10l-agri-drone");
  });

  it("builds authoritative Wix price and description patches", () => {
    const patch = buildWixPatch(
      {
        slug: "source-10l-agri-drone",
        name: "10L Agri Drone",
        price: 410000,
        description: "",
        source_description: "old"
      },
      wixProduct,
      { forceDescription: true }
    );

    expect(patch.price).toBe(341000);
    expect(patch.source_catalog_id).toBe("mithron-10l-agri-drone");
    expect(String(patch.description)).toContain("Canonical Wix description");
  });
});

describe("product reconcile audit", () => {
  it("clusters duplicate normalized names and price drift", () => {
    const report = buildProductReconcileReport(
      [wixProduct],
      [
        {
          slug: "source-10l-agri-drone",
          name: "10L Agri Drone",
          price: 410000,
          category: "Agri Drones",
          source_catalog_id: "mithron-10l-agri-drone",
          source_url: wixProduct.source_url,
          is_visible: true,
          workflow_status: "published"
        },
        {
          slug: "agri-kisan-10-liter",
          name: "10L Agri Drone",
          price: 450000,
          category: "Agri Drones",
          is_visible: true,
          workflow_status: "published"
        }
      ]
    );

    expect(report.summary.price_drift).toBeGreaterThanOrEqual(1);
    expect(report.duplicate_clusters.length).toBeGreaterThan(0);
    expect(report.duplicate_clusters[0]?.slugs).toEqual(
      expect.arrayContaining(["source-10l-agri-drone", "agri-kisan-10-liter"])
    );
  });
});
