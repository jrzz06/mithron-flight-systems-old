import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("admin Supabase-only workflow recovery", () => {
  it("removes storefront mock fallback from admin-managed hero content", () => {
    const cmsService = source("services/cms.ts");
    const heroCarousel = source("sections/home/hero-carousel.tsx");
    const resolveHero = source("lib/media/resolve-hero-carousel-slides.ts");

    expect(cmsService).toContain("export const emptySupabaseOnlySnapshot");
    expect(cmsService).not.toContain("import { heroSlides");
    expect(cmsService).not.toContain("home: {\n    heroBanners: heroSlides");
    expect(cmsService).toContain("source: \"supabase\"");
    expect(heroCarousel).not.toContain("slides = heroSlides");
    expect(heroCarousel).not.toContain("defaultHeroSlides");
    expect(heroCarousel).not.toContain("heroSlideCopyById");
    expect(resolveHero).not.toContain("config/products");
    expect(resolveHero).not.toContain("defaultHeroSlides");
    expect(heroCarousel).toContain('data-hero-slide-state="active"');
    expect(heroCarousel).toContain("<video");
  });

  it("loads full Supabase product and media visibility instead of first-page samples", () => {
    const adminService = source("services/admin.ts");

    expect(adminService).toContain("productCounts");
    expect(adminService).toContain("mediaCounts");
    expect(adminService).toContain("stockCoverage");
    expect(adminService).toContain("countTable(config, \"mithron_products\")");
    expect(adminService).toContain("countTable(config, \"media_assets\")");
    expect(adminService).toContain("fetchAdminRows(config, \"category_metadata\"");
    expect(adminService).toContain("adminFetchErrorMessage");
    expect(adminService).toContain("AbortSignal.timeout(ADMIN_FETCH_TIMEOUT_MS)");
    expect(adminService).toContain("PRODUCT_MANAGER_LIMIT");
    expect(adminService).toContain("MEDIA_LIBRARY_LIMIT");
    expect(adminService).not.toContain("limit=500");
  });

  it("uses a minimal dark admin chrome across control-plane shells", () => {
    const frame = source("components/admin/admin-frame.tsx");
    const shell = source("components/platform/platform-shell.tsx");
    const primitives = source("components/admin/module-panel.tsx");
    const topbar = source("components/platform/platform-topbar.tsx");

    expect(shell).toContain('data-control-plane-theme="dark"');
    expect(shell).toContain("bg-[var(--platform-bg)]");
    expect(frame).toContain("PlatformShell");
    expect(primitives).toContain("var(--platform-border)");
    expect(topbar).toContain("data-admin-topbar");
    expect(frame).not.toContain("bg-[#070B14]");
  });

  it("turns product forms into layman-editable structured media workflows", () => {
    const productsPage = source("app/admin/products/page.tsx");

    expect(productsPage).toContain("data-product-media-picker");
    expect(productsPage).toContain("ProductCreateDetailFields");
    expect(productsPage).toContain("ProductCategoryField");
    expect(productsPage).toContain("Image URL");
    expect(productsPage).toContain("Upload image");
    expect(productsPage).toContain("data-product-supabase-storage-note");
    expect(productsPage).not.toContain("data-product-spec-rows");
    expect(productsPage).not.toContain("data-product-advanced-json");
    expect(productsPage).not.toContain("<span className=\"text-white/70\">Variants</span>");
    expect(productsPage).not.toContain("defaultValue=\"[]\" rows={4} className=\"rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 font-mono");
  });

  it("supports product video uploads and rejects unsupported files clearly", () => {
    const mediaManager = source("services/media-manager.ts");
    const productsActions = source("app/admin/products/actions.ts");

    expect(mediaManager).toContain("videoMimeTypes");
    expect(mediaManager).toContain("video/mp4");
    expect(mediaManager).toContain("video/webm");
    expect(mediaManager).toContain("video/quicktime");
    expect(mediaManager).toContain("ALLOWED_MEDIA_MIME_TYPES");
    expect(productsActions).toContain("assertAllowedMediaMimeType");
    expect(productsActions).toContain("upsertMediaAssetRecord");
  });

  it("makes admin booking confirmation and warehouse handoff visible without JSON-first forms", () => {
    const ordersPage = source("app/admin/orders/page.tsx");
    const ordersWorkspace = source("components/admin/admin-orders-workspace.tsx");
    const ordersToolbar = source("components/admin/orders/admin-orders-toolbar.tsx");
    const ordersActionsRail = source("components/admin/orders/admin-order-actions-rail.tsx");
    const warehouseActions = source("app/warehouse/actions.ts");

    expect(ordersPage).toContain("AdminOrdersWorkspace");
    expect(ordersToolbar).toContain("data-booking-workflow-board");
    expect(ordersWorkspace).toContain("data-order-transition-feedback");
    expect(ordersActionsRail).toContain("pendingLabel=\"Assigning...\"");
    expect(ordersPage).not.toContain("Order items JSON");
    expect(ordersPage).not.toContain("Metadata JSON");
    expect(ordersPage).not.toContain("Shipment tracking JSON");
    expect(warehouseActions).toContain("createShipmentWorkflow(input");
  });
});

