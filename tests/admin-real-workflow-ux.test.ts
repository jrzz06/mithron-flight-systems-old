import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("admin real workflow UX", () => {
  it("uses Supabase row truth instead of id-only counts or capped product previews", () => {
    const adminService = source("services/admin.ts");
    const productsPage = source("app/admin/products/page.tsx");
    const productGrid = source("app/admin/products/product-catalog-grid.tsx");

    expect(adminService).toContain("select=id&limit=1");
    expect(adminService).toContain("PRODUCT_MANAGER_LIMIT");
    expect(adminService).toContain("inventoryCatalogQuery");
    expect(adminService).toContain("inventoryRowLimit");
    expect(productsPage).not.toContain("slice(0, 16)");
    expect(productsPage).toContain("ProductCatalogGrid");
    expect(productGrid).toContain("data-product-card");
    expect(productGrid).toContain("data-product-row-action=\"archive\"");
    expect(productGrid).toContain("data-product-row-action=\"delete\"");
    expect(productsPage).not.toContain("data-product-row-action=\"hard-delete\"");
    expect(productsPage).not.toContain("hard-delete-product");
  });

  it("keeps product and order forms layman-readable without visible JSON fields", () => {
    const productsPage = source("app/admin/products/page.tsx");
    const ordersPage = source("app/admin/orders/page.tsx");
    const ordersWorkspace = source("components/admin/admin-orders-workspace.tsx");
    const ordersCreateDrawer = source("components/admin/orders/admin-order-create-drawer.tsx");
    const ordersActionsRail = source("components/admin/orders/admin-order-actions-rail.tsx");
    const ordersProducts = source("components/admin/orders/admin-order-products-section.tsx");
    const ordersDetail = source("components/admin/orders/admin-order-detail.tsx");
    const ordersPrimitives = source("components/admin/orders/order-detail-primitives.tsx");
    const ordersThumbnail = source("components/admin/orders/order-product-thumbnail.tsx");
    const ordersStatusBadge = source("components/admin/orders/order-status-badge.tsx");
    const ordersUi = `${ordersPage}\n${ordersWorkspace}\n${ordersCreateDrawer}\n${ordersActionsRail}\n${ordersProducts}\n${ordersDetail}\n${ordersPrimitives}\n${ordersThumbnail}\n${ordersStatusBadge}`;
    const productForms = source("services/product-admin-forms.ts");
    const orderForms = source("services/enterprise-admin-forms.ts");

    expect(productsPage).not.toContain("Image JSON");
    expect(productsPage).not.toContain("Hero JSON");
    expect(productsPage).not.toContain("Gallery JSON array");
    expect(productsPage).not.toContain("Hero image URL");
    expect(productsPage).not.toContain("Gallery image URLs");
    expect(productsPage).not.toContain("Advanced structured fields");
    expect(productsPage).toContain("ProductCreateDetailFields");
    expect(productsPage).toContain("ProductCategoryField");
    const multiImageField = source("components/products/product-multi-image-field.tsx");
    expect(multiImageField).toContain("Primary image URL");
    expect(multiImageField).toContain("Upload images");
    expect(productsPage).toContain("data-product-supabase-storage-note");
    expect(productForms).toContain("image_src");
    expect(productForms).toContain("gallery_urls");

    expect(ordersUi).not.toContain("Order items JSON");
    expect(ordersUi).not.toContain("Metadata JSON");
    expect(ordersUi).not.toContain("Shipment tracking JSON");
    expect(ordersUi).not.toContain('id="create-order"');
    expect(ordersUi).toContain("data-order-detail-panel");
    expect(ordersUi).toContain("data-shipment-actions");
    expect(ordersUi).toContain("data-inventory-allocation");
    expect(ordersProducts).toContain("resolveCatalogAvailability");
    expect(ordersProducts).toContain("inventory:");
    expect(ordersUi).not.toContain("No image");
    expect(orderForms).toContain("order_item_product_slug");
    expect(orderForms).toContain("tracking_number");
  });

  it("keeps product media uploads and public CMS read mapping on structured media columns", () => {
    const productsActions = source("app/admin/products/actions.ts");
    const publicCms = source("services/cms.ts");

    expect(publicCms).toContain("mediaFromColumns");
    expect(publicCms).not.toContain("slide.productSlug && slide.title");
    expect(productsActions).toContain("uploadProductImagesForDraft");
    expect(productsActions).toContain("linkUploadedImagesToProduct");
  });

  it("switches the control plane to a minimal dark enterprise theme", () => {
    const frame = source("components/admin/admin-frame.tsx");
    const shell = source("components/platform/platform-shell.tsx");
    const globals = source("app/globals.css");
    const platformStyles = source("app/platform.css");

    expect(shell).toContain('data-control-plane-theme="dark"');
    expect(frame).toContain("PlatformShell");
    expect(shell).toContain("data-admin-performance-theme");
    expect(shell).toContain('@/app/platform.css');
    expect(platformStyles).toContain('[data-control-plane-theme="dark"]');
    expect(platformStyles).toContain("--platform-bg: #14161a");
    expect(platformStyles).toContain("--platform-text-primary: #eceef2");
    expect(globals).not.toContain('[data-control-plane-theme="dark"]');
  });

  it("keeps admin and warehouse startup payloads bounded for a responsive prototype", () => {
    const adminPage = source("app/admin/page.tsx");
    const adminService = source("services/admin.ts");
    const realtimeHook = source("hooks/use-enterprise-realtime.ts");
    const warehousePage = source("app/warehouse/page.tsx");

    expect(adminPage).not.toContain("getEnterpriseCleanupSnapshot");
    expect(warehousePage).not.toContain("EnterpriseRealtimePanel");
    expect(realtimeHook).not.toContain("router.refresh");

    const warehouseSnapshotStart = adminService.indexOf("const loadWarehouseSnapshot = cache");
    const operationsSnapshotStart = adminService.indexOf("export const getOperationsSnapshot = cache");
    const warehouseSnapshotSource = adminService.slice(warehouseSnapshotStart, operationsSnapshotStart);
    expect(warehouseSnapshotSource).toContain("inventoryCatalogQuery");
    expect(warehouseSnapshotSource).toContain("inventoryRowLimit");
    expect(warehouseSnapshotSource).toContain("scopeOrderRelations");
    expect(warehouseSnapshotSource).toContain("collectOrderItemProductSlugs");
    expect(warehouseSnapshotSource).toContain("mergeInventoryRowsByProductSlug");
    expect(warehouseSnapshotSource).toContain("product_slug=in.(");
    expect(warehouseSnapshotSource).not.toContain("select=*");
    expect(warehouseSnapshotSource).toContain("WAREHOUSE_SNAPSHOT_ROW_LIMIT");
  });
});

