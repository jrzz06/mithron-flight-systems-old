"use client";

import { usePathname } from "next/navigation";
import { useCallback } from "react";
import { useControlPlaneLiveSync } from "@/components/control-plane/use-control-plane-live-sync";

const STOREFRONT_TRIGGER_TABLES = new Set([
  "mithron_products",
  "category_metadata",
  "media_assets",
  "product_media_assets",
  "cms_pages",
  "cms_sections",
  "hero_banners",
  "homepage_ordering",
  "site_navigation",
  "footer_columns",
  "footer_links",
  "promotional_campaigns",
  "faqs",
  "blog_posts"
]);

/** Routes where a full router.refresh from CMS/catalog realtime is not useful. */
const STOREFRONT_LIVE_SYNC_SKIP_PREFIXES = ["/checkout", "/cart", "/account"];

function shouldRefreshStorefront(table: string) {
  return STOREFRONT_TRIGGER_TABLES.has(table);
}

export function StorefrontLiveSync({ enabled = true }: { enabled?: boolean }) {
  const pathname = usePathname() || "/";
  const routeAllowsRefresh = !STOREFRONT_LIVE_SYNC_SKIP_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  const shouldRefresh = useCallback(
    (table: string) => routeAllowsRefresh && shouldRefreshStorefront(table),
    [routeAllowsRefresh]
  );

  useControlPlaneLiveSync("storefront", shouldRefresh, enabled && routeAllowsRefresh);

  if (!enabled) return null;

  return <div data-storefront-live-sync className="sr-only" aria-hidden="true" />;
}
