import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { roleHasPermission } from "@/lib/auth/permissions";
import {
  deleteOrArchiveProduct,
  getProductDeletionBlockers,
  isProductArchivedRecord
} from "@/services/admin-actions";
import {
  buildProductDeleteFromFormData,
  buildProductForceDeleteFromFormData,
  buildProductRemoveFromFormData
} from "@/services/product-admin-forms";

vi.mock("@/services/auth", () => ({
  requirePermission: vi.fn(async () => ({
    userId: "actor-1",
    role: "admin"
  }))
}));

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

const testEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key"
};

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    return handler(url, init);
  }) as typeof fetch;
}

describe("product delete workflow", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects archived products from workflow status or archived_at", () => {
    expect(isProductArchivedRecord({ workflow_status: "archived" })).toBe(true);
    expect(isProductArchivedRecord({ archived_at: "2026-01-01T00:00:00.000Z" })).toBe(true);
    expect(isProductArchivedRecord({ workflow_status: "published" })).toBe(false);
  });

  it("allows force delete only when order and shipment history are empty", async () => {
    const { productDeletionAllowsForce } = await import("@/lib/product-deletion");
    expect(productDeletionAllowsForce({
      inventory_movements: 2,
      shipment_items: 0,
      order_items: 0,
      hero_banners: 0,
      product_reviews: 0,
      faqs: 0
    })).toBe(true);
    expect(productDeletionAllowsForce({
      inventory_movements: 0,
      shipment_items: 1,
      order_items: 0,
      hero_banners: 0,
      product_reviews: 0,
      faqs: 0
    })).toBe(false);
  });

  it("returns blocker counts with hasBlockers boolean", async () => {
    vi.stubGlobal("fetch", mockFetch((url) => {
      if (url.includes("/inventory_movements?")) {
        return new Response(JSON.stringify([{ id: "movement-1" }]), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    }));

    const result = await getProductDeletionBlockers("testing-product", testEnv);
    expect(result.blockers).toEqual({
      inventory_movements: 1,
      shipment_items: 0,
      order_items: 0,
      hero_banners: 0,
      product_reviews: 0,
      faqs: 0
    });
    expect(result.hasBlockers).toBe(true);
    expect(result.blockerCount).toBe(1);
  });

  it("auto mode archives when inventory_movements > 0", async () => {
    vi.stubGlobal("fetch", mockFetch((url, init) => {
      if (url.includes("/mithron_products?") && init?.method === "PATCH") {
        return new Response(JSON.stringify([{
          slug: "testing-product",
          workflow_status: "archived",
          is_visible: false
        }]), { status: 200 });
      }
      if (url.includes("/mithron_products?")) {
        return new Response(JSON.stringify([{
          slug: "testing-product",
          workflow_status: "published"
        }]), { status: 200 });
      }
      if (url.includes("/inventory_movements?")) {
        return new Response(JSON.stringify([{ id: "movement-1" }]), { status: 200 });
      }
      if (url.includes("/audit_logs")) {
        return new Response("{}", { status: 201 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    }));

    const result = await deleteOrArchiveProduct("testing-product", "actor-1", { mode: "auto" }, testEnv);
    expect(result.outcome).toBe("archived");
    expect(result.blockers.inventory_movements).toBe(1);
  });

  it("hard mode rejects non-archived products", async () => {
    vi.stubGlobal("fetch", mockFetch((url) => {
      if (url.includes("/mithron_products?")) {
        return new Response(JSON.stringify([{
          slug: "live-product",
          workflow_status: "published"
        }]), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    }));

    await expect(deleteOrArchiveProduct("live-product", "actor-1", { mode: "hard" }, testEnv))
      .rejects.toThrow("must be archived before permanent delete");
  });

  it("force_hard rejects products with order or shipment history", async () => {
    vi.stubGlobal("fetch", mockFetch((url) => {
      if (url.includes("/mithron_products?")) {
        return new Response(JSON.stringify([{
          slug: "archived-product",
          workflow_status: "archived",
          archived_at: "2026-01-01T00:00:00.000Z"
        }]), { status: 200 });
      }
      if (url.includes("/order_items?")) {
        return new Response(JSON.stringify([{ id: "order-item-1" }]), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    }));

    await expect(deleteOrArchiveProduct("archived-product", "actor-1", { mode: "force_hard" }, testEnv))
      .rejects.toThrow("Cannot force delete product archived-product with order or shipment history");
  });

  it("force_hard cascades inventory movements before deleting the product", async () => {
    const deletedUrls: string[] = [];
    vi.stubGlobal("fetch", mockFetch((url, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "DELETE") {
        deletedUrls.push(url);
        return new Response(JSON.stringify([{ id: "deleted-1" }]), { status: 200 });
      }
      if (url.includes("/mithron_products?")) {
        return new Response(JSON.stringify([{
          slug: "flying-drone",
          workflow_status: "archived",
          archived_at: "2026-01-01T00:00:00.000Z"
        }]), { status: 200 });
      }
      if (url.includes("/inventory_movements?")) {
        return new Response(JSON.stringify([{ id: "movement-1" }]), { status: 200 });
      }
      if (url.includes("/audit_logs")) {
        return new Response("{}", { status: 201 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    }));

    const result = await deleteOrArchiveProduct("flying-drone", "actor-1", { mode: "force_hard" }, testEnv);
    expect(result.outcome).toBe("force_deleted");
    expect(result.deletedDependencies?.inventory_movements).toBeGreaterThan(0);
    expect(deletedUrls.some((url) => url.includes("/inventory_movements?") && url.includes("product_id=eq.flying-drone"))).toBe(true);
    expect(deletedUrls.some((url) => url.includes("/mithron_products?") && url.includes("slug=eq.flying-drone"))).toBe(true);
    const movementDeleteIndex = deletedUrls.findIndex((url) => url.includes("/inventory_movements?"));
    const productDeleteIndex = deletedUrls.findIndex((url) => url.includes("/mithron_products?"));
    expect(movementDeleteIndex).toBeGreaterThan(-1);
    expect(productDeleteIndex).toBeGreaterThan(movementDeleteIndex);
  });

  it("hard mode still blocks when inventory movements exist without force", async () => {
    vi.stubGlobal("fetch", mockFetch((url) => {
      if (url.includes("/mithron_products?")) {
        return new Response(JSON.stringify([{
          slug: "flying-drone",
          workflow_status: "archived",
          archived_at: "2026-01-01T00:00:00.000Z"
        }]), { status: 200 });
      }
      if (url.includes("/inventory_movements?")) {
        return new Response(JSON.stringify([{ id: "movement-1" }]), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    }));

    await expect(deleteOrArchiveProduct("flying-drone", "actor-1", { mode: "hard" }, testEnv))
      .rejects.toThrow("Archive it instead of hard deleting");
  });

  it("restricts products.permanent_delete to admin role", () => {
    expect(roleHasPermission("admin", "products.permanent_delete")).toBe(true);
    expect(roleHasPermission("warehouse", "products.permanent_delete")).toBe(false);
    expect(roleHasPermission("supplier", "products.permanent_delete")).toBe(false);
  });

  it("maps remove and force-delete form data with explicit confirmation", () => {
    expect(buildProductRemoveFromFormData(formData({
      product_slug: "source-remove-me",
      confirm_slug: "source-remove-me",
      change_summary: "Remove test product"
    }))).toEqual({
      table: "mithron_products",
      identity: { slug: "source-remove-me" },
      fields: { confirm_slug: "source-remove-me" },
      entityId: "source-remove-me",
      changeSummary: "Remove test product"
    });

    expect(buildProductForceDeleteFromFormData(formData({
      product_slug: "source-force-me",
      confirm_slug: "source-force-me",
      force_delete: "1"
    }))).toEqual({
      table: "mithron_products",
      identity: { slug: "source-force-me" },
      fields: { confirm_slug: "source-force-me", force_delete: true },
      entityId: "source-force-me",
      changeSummary: "Force delete product source-force-me"
    });

    expect(() => buildProductForceDeleteFromFormData(formData({
      product_slug: "source-force-me",
      confirm_slug: "source-force-me"
    }))).toThrow("Force delete must be explicitly confirmed.");
  });

  it("wires remove, permanent delete via force_delete FormData, and blocker preview actions", () => {
    const pageSource = readFileSync(join(process.cwd(), "app/admin/products/page.tsx"), "utf8");
    const gridSource = readFileSync(join(process.cwd(), "app/admin/products/product-catalog-grid.tsx"), "utf8");
    const actionSource = readFileSync(join(process.cwd(), "app/admin/products/actions.ts"), "utf8");
    const adminActionsSource = readFileSync(join(process.cwd(), "services/admin-actions.ts"), "utf8");

    expect(adminActionsSource).toContain("getProductDeletionBlockers");
    expect(adminActionsSource).toContain("archiveProductRecord");
    expect(adminActionsSource).toContain('options.mode === "auto"');
    expect(adminActionsSource).toContain("assertProductCanForceDelete");
    expect(adminActionsSource).toContain('"force_deleted"');
    expect(adminActionsSource).toContain('force: true');
    expect(adminActionsSource).toContain('product_id');
    expect(actionSource).toContain("saveProductRemoveFormAction");
    expect(actionSource).toContain("saveProductHardDeleteFormAction");
    expect(actionSource).toContain("saveProductForceDeleteFormAction");
    expect(actionSource).toContain('formData.get("force_delete")');
    expect(actionSource).toContain('mode: "force_hard"');
    expect(actionSource).toContain("previewProductDeleteAction");
    expect(actionSource).toContain("deleteOrArchiveProduct");
    expect(actionSource).toContain('actionKind: "remove"');
    expect(actionSource).toContain('actionKind: "permanent_delete"');
    expect(actionSource).toContain('products.permanent_delete');
    expect(gridSource).toContain("saveProductRemoveFormAction");
    expect(gridSource).toContain("saveProductHardDeleteFormAction");
    expect(gridSource).not.toContain("saveProductForceDeleteFormAction");
    expect(gridSource).toContain('name="force_delete"');
    expect(gridSource).toContain("previewProductDeleteAction");
    expect(gridSource).toContain('data-product-row-action={isArchivedView ? "permanent-delete" : "remove"}');
    expect(gridSource).not.toContain("setDeletedProductIds");
    expect(pageSource).toContain("canForceDelete={canForceDeleteProducts}");
    expect(pageSource).toContain("ProductCatalogGrid");
    expect(buildProductDeleteFromFormData(formData({
      product_slug: "source-delete-me",
      confirm_slug: "source-delete-me"
    })).entityId).toBe("source-delete-me");
  });
});
