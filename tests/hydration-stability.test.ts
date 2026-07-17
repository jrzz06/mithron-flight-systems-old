import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("hydration stability", () => {
  it("avoids route-transition server/client branches during initial render", () => {
    const routeTransition = source("components/layout/route-transition.tsx");
    const globals = source("app/globals.css");

    expect(routeTransition).not.toContain("typeof window");
    expect(routeTransition).not.toContain("framer-motion");
    expect(routeTransition).not.toContain("motion.div");
    expect(routeTransition).toContain("useState(false)");
    expect(routeTransition).toContain("setAnimateEntry(true)");
    expect(globals).toContain("@keyframes mithronRouteEntry");
  });

  it("defers persisted cart badge until after client hydration", () => {
    const cartNavButton = source("components/navigation/cart-nav-button.tsx");

    expect(cartNavButton).toContain("useCartSessionReady");
    expect(cartNavButton).toContain("const displayCount = isReady ? count : 0");
    expect(cartNavButton).not.toContain("typeof window");
  });

  it("rehydrates cart state safely before purchase actions are enabled", () => {
    const cartStore = source("store/cart.ts");
    const storeShell = source("components/layout/store-shell-client.tsx");
    const configurator = source("sections/product/product-configurator.tsx");
    const stickyPurchase = source("sections/product/showcase/product-sticky-purchase.tsx");

    expect(cartStore).toContain("skipHydration: true");
    expect(cartStore).toContain("mergeRehydratedCartState");
    expect(cartStore).toContain("useCartHasHydrated");
    expect(cartStore).toContain("useCartSessionReady");
    expect(storeShell).toContain("useCartAuthSync");
    expect(configurator).toContain("useCartSessionReady");
    expect(configurator).toContain("cartReady");
    expect(stickyPurchase).toContain("useCartHasHydrated");
  });

  it("keeps public CMS storefront reads bounded", () => {
    const cms = source("services/cms.ts");
    const publicSnapshotLoader = cms.match(/async function loadPublicCmsSnapshot[\s\S]*?export const getPublicCmsSnapshot/)?.[0] ?? "";

    expect(publicSnapshotLoader).not.toContain("select=*");
    expect(cms).not.toContain('query = "select=*');
    expect(cms).toContain("publicCmsQueries");
    expect(cms).toContain("select=id,product_slug,title,subtitle,cta_label,href,image,poster,video,theme,composition,title_color,subtitle_color,sort_order,is_visible,status");
    expect(cms).toContain("select=id,reviewer_name,body,product_slug,rating,sort_order,is_visible,status");
  });

  it("formats relative/absolute admin dates with a fixed locale for SSR/CSR parity", () => {
    const copy = source("lib/platform/copy.ts");
    const contactQueue = source("components/admin/admin-contact-request-queue.tsx");

    expect(copy).toContain('toLocaleDateString("en-IN"');
    expect(copy).toContain('timeZone: "Asia/Kolkata"');
    expect(copy).not.toContain("toLocaleDateString(undefined");
    expect(contactQueue).toContain('toLocaleString("en-IN"');
    expect(contactQueue).toContain('timeZone: "Asia/Kolkata"');
    expect(contactQueue).not.toContain("toLocaleString(undefined");
  });

  it("hydrates manual-order drafts from localStorage only after mount", () => {
    const panel = source("components/admin/manual-order-create-panel.tsx");

    expect(panel).toContain("useState<ManualOrderDraft>(() => defaultDraft())");
    expect(panel).toContain("setDraft(readDraftFromStorage())");
    expect(panel).toContain("if (!draftHydrated) return");
    expect(panel).not.toContain("useState<ManualOrderDraft>(() => readDraftFromStorage())");
  });
});
