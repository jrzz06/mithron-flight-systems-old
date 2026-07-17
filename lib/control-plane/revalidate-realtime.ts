"use server";

import { after } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { invalidateCatalogRedisCaches, invalidateCmsRedisCaches } from "@/lib/cache-invalidation";
import { deleteCachedKeys, invalidateControlPlaneRedisCaches, REDIS_CACHE_KEYS } from "@/lib/cache-redis";

const WAREHOUSE_SNAPSHOT_TAGS = [
  "admin-warehouse-snapshot",
  "control-plane-orders",
  "control-plane-inventory",
  "control-plane-catalog",
  "control-plane-warehouse"
] as const;

const STOREFRONT_CATALOG_TAGS = ["catalog", "catalog-products", "catalog-search"] as const;
const STOREFRONT_CMS_TAGS = ["cms", "cms-public", "cms-orchestration"] as const;
const STOREFRONT_PATHS = ["/", "/products", "/blog"] as const;

const CATALOG_REALTIME_TABLES = new Set([
  "mithron_products",
  "category_metadata",
  "media_assets",
  "product_media_assets",
  "inventory",
  "warehouse_stock"
]);

const CMS_REALTIME_TABLES = new Set([
  "cms_pages",
  "cms_sections",
  "hero_banners",
  "faqs",
  "promotional_campaigns",
  "section_visibility",
  "homepage_ordering",
  "site_navigation",
  "footer_columns",
  "footer_links",
  "content_revisions",
  "blog_posts",
  "media_assets"
]);

const TABLE_REVALIDATION: Record<string, { tags: string[]; paths: string[] }> = {
  orders: {
    tags: ["admin-dashboard", "control-plane-orders", ...WAREHOUSE_SNAPSHOT_TAGS],
    paths: ["/admin", "/admin/orders", "/warehouse/dashboard", "/warehouse/orders", "/warehouse/fulfillment", "/warehouse/activity", "/account/orders"]
  },
  order_items: {
    tags: ["admin-dashboard", "control-plane-orders", ...WAREHOUSE_SNAPSHOT_TAGS],
    paths: ["/admin/orders", "/warehouse/orders", "/warehouse/fulfillment"]
  },
  inventory: {
    tags: ["admin-dashboard", "control-plane-inventory", ...WAREHOUSE_SNAPSHOT_TAGS, ...STOREFRONT_CATALOG_TAGS],
    paths: ["/admin", "/admin/inventory", "/warehouse/dashboard", ...STOREFRONT_PATHS]
  },
  inventory_movements: {
    tags: ["control-plane-inventory"],
    paths: ["/admin/inventory"]
  },
  warehouse_stock: {
    tags: ["control-plane-warehouse", "control-plane-inventory", ...STOREFRONT_CATALOG_TAGS],
    paths: ["/warehouse/dashboard", ...STOREFRONT_PATHS]
  },
  mithron_products: {
    tags: ["admin-dashboard", "control-plane-catalog", ...WAREHOUSE_SNAPSHOT_TAGS, ...STOREFRONT_CATALOG_TAGS],
    paths: ["/admin", "/admin/products", "/supplier", ...STOREFRONT_PATHS]
  },
  category_metadata: {
    tags: ["admin-dashboard", "control-plane-cms", ...STOREFRONT_CATALOG_TAGS, ...STOREFRONT_CMS_TAGS],
    paths: ["/admin/cms", ...STOREFRONT_PATHS]
  },
  media_assets: {
    tags: ["admin-dashboard", "control-plane-cms", ...STOREFRONT_CATALOG_TAGS, ...STOREFRONT_CMS_TAGS],
    paths: ["/admin/cms", ...STOREFRONT_PATHS]
  },
  product_media_assets: {
    tags: ["admin-dashboard", "control-plane-catalog", ...STOREFRONT_CATALOG_TAGS],
    paths: ["/admin/products", ...STOREFRONT_PATHS]
  },
  customer_order_reviews: {
    tags: ["admin-dashboard", "control-plane-reviews"],
    paths: ["/admin/reviews"]
  },
  blog_posts: {
    tags: ["admin-dashboard", "control-plane-blog", "blog", ...STOREFRONT_CMS_TAGS],
    paths: ["/admin/blog", "/blog", "/"]
  },
  cms_pages: {
    tags: ["admin-dashboard", "control-plane-cms", ...STOREFRONT_CMS_TAGS],
    paths: ["/admin/cms", ...STOREFRONT_PATHS]
  },
  cms_sections: {
    tags: ["admin-dashboard", "control-plane-cms", ...STOREFRONT_CMS_TAGS],
    paths: ["/admin/cms", ...STOREFRONT_PATHS]
  },
  hero_banners: {
    tags: ["admin-dashboard", "control-plane-cms", ...STOREFRONT_CMS_TAGS],
    paths: ["/admin/cms", ...STOREFRONT_PATHS]
  },
  faqs: {
    tags: ["admin-dashboard", "control-plane-cms", ...STOREFRONT_CMS_TAGS],
    paths: ["/admin/cms", ...STOREFRONT_PATHS]
  },
  promotional_campaigns: {
    tags: ["admin-dashboard", "control-plane-cms", ...STOREFRONT_CMS_TAGS],
    paths: ["/admin/cms", ...STOREFRONT_PATHS]
  },
  section_visibility: {
    tags: ["admin-dashboard", "control-plane-cms", ...STOREFRONT_CMS_TAGS],
    paths: ["/admin/cms", ...STOREFRONT_PATHS]
  },
  homepage_ordering: {
    tags: ["admin-dashboard", "control-plane-cms", ...STOREFRONT_CMS_TAGS],
    paths: ["/admin/cms", ...STOREFRONT_PATHS]
  },
  site_navigation: {
    tags: ["admin-dashboard", "control-plane-cms", ...STOREFRONT_CMS_TAGS],
    paths: ["/admin/cms", ...STOREFRONT_PATHS]
  },
  footer_columns: {
    tags: ["admin-dashboard", "control-plane-cms", ...STOREFRONT_CMS_TAGS],
    paths: ["/admin/cms", ...STOREFRONT_PATHS]
  },
  footer_links: {
    tags: ["admin-dashboard", "control-plane-cms", ...STOREFRONT_CMS_TAGS],
    paths: ["/admin/cms", ...STOREFRONT_PATHS]
  },
  content_revisions: {
    tags: ["admin-dashboard", "control-plane-cms", ...STOREFRONT_CMS_TAGS],
    paths: ["/admin/cms", ...STOREFRONT_PATHS]
  },
  warehouses: {
    tags: ["admin-dashboard", "control-plane-warehouses"],
    paths: ["/admin/warehouses"]
  },
  enquiries: {
    tags: ["admin-dashboard", "control-plane-enquiries"],
    paths: ["/admin", "/admin/enquiries"]
  },
  contact_requests: {
    tags: ["admin-dashboard", "control-plane-enquiries"],
    paths: ["/admin/enquiries", "/admin/contact-requests"]
  },
  notifications: {
    tags: ["admin-dashboard", "control-plane-notifications"],
    paths: ["/admin", "/warehouse/dashboard", "/supplier"]
  },
  activity_logs: {
    tags: ["admin-dashboard", "control-plane-activity"],
    paths: ["/admin", "/warehouse/activity"]
  },
  shipments: {
    tags: ["control-plane-warehouse", ...WAREHOUSE_SNAPSHOT_TAGS],
    paths: ["/warehouse/dashboard", "/warehouse/activity", "/warehouse/fulfillment", "/admin/orders"]
  },
  payments: {
    tags: ["admin-dashboard", "control-plane-orders", ...WAREHOUSE_SNAPSHOT_TAGS],
    paths: ["/admin", "/admin/orders", "/account/orders", "/warehouse/dashboard", "/warehouse/orders"]
  },
  profiles: {
    tags: ["admin-dashboard", "admin-suppliers", "control-plane-suppliers", "control-plane-warehouses"],
    paths: ["/admin/suppliers", "/admin/users", "/admin/warehouses"]
  },
  user_roles: {
    tags: ["admin-dashboard", "admin-suppliers", "control-plane-suppliers"],
    paths: ["/admin/suppliers", "/admin/users"]
  }
};

const CONTROL_PLANE_INVALIDATION: Record<
  string,
  Partial<{
    adminDashboard: boolean;
    warehouseSnapshots: boolean;
    inventoryMetrics: boolean;
    navMetrics: boolean;
    supplierNavMetrics: boolean;
    productManagerSnapshot: boolean;
    suppliersSnapshot: boolean;
    cmsSnapshots: boolean;
    adminEnquiries: boolean;
    adminReviews: boolean;
    adminBlog: boolean;
    adminWarehouses: boolean;
    csvInventory: boolean;
  }>
> = {
  orders: { adminDashboard: true, warehouseSnapshots: true, navMetrics: true },
  order_items: { adminDashboard: true, warehouseSnapshots: true, navMetrics: true },
  payments: { adminDashboard: true, warehouseSnapshots: true, navMetrics: true },
  shipments: { adminDashboard: true, warehouseSnapshots: true, navMetrics: true },
  inventory: { adminDashboard: true, warehouseSnapshots: true, inventoryMetrics: true, supplierNavMetrics: true, productManagerSnapshot: true, csvInventory: true },
  inventory_movements: { adminDashboard: true, warehouseSnapshots: true, inventoryMetrics: true, productManagerSnapshot: true, csvInventory: true },
  warehouse_stock: { adminDashboard: true, warehouseSnapshots: true, inventoryMetrics: true, supplierNavMetrics: true, productManagerSnapshot: true, csvInventory: true },
  mithron_products: {
    adminDashboard: true,
    warehouseSnapshots: true,
    navMetrics: true,
    supplierNavMetrics: true,
    productManagerSnapshot: true,
    suppliersSnapshot: true,
    csvInventory: true
  },
  customer_order_reviews: { adminReviews: true },
  blog_posts: { adminBlog: true },
  enquiries: { adminDashboard: true, adminEnquiries: true, navMetrics: true },
  contact_requests: { adminDashboard: true, adminEnquiries: true, navMetrics: true },
  cms_pages: { cmsSnapshots: true },
  cms_sections: { cmsSnapshots: true },
  hero_banners: { cmsSnapshots: true },
  faqs: { cmsSnapshots: true },
  promotional_campaigns: { cmsSnapshots: true },
  section_visibility: { cmsSnapshots: true },
  homepage_ordering: { cmsSnapshots: true },
  site_navigation: { cmsSnapshots: true },
  footer_columns: { cmsSnapshots: true },
  footer_links: { cmsSnapshots: true },
  content_revisions: { cmsSnapshots: true },
  category_metadata: { cmsSnapshots: true, productManagerSnapshot: true },
  media_assets: { cmsSnapshots: true, productManagerSnapshot: true },
  product_media_assets: { productManagerSnapshot: true, csvInventory: true },
  warehouses: { adminWarehouses: true },
  profiles: { suppliersSnapshot: true, adminWarehouses: true },
  user_roles: { suppliersSnapshot: true },
  notifications: { adminDashboard: true, supplierNavMetrics: true },
  activity_logs: { adminDashboard: true, warehouseSnapshots: true }
};

export async function revalidateWarehouseSnapshotCache() {
  for (const tag of WAREHOUSE_SNAPSHOT_TAGS) {
    revalidateTag(tag, "max");
  }
}

export async function revalidateControlPlaneRealtime(table: string) {
  const config = TABLE_REVALIDATION[table] ?? {
    tags: ["admin-dashboard"],
    paths: ["/admin"]
  };

  // Cheap, in-process Next.js cache invalidation first so a slow/degraded
  // Redis endpoint can never prevent tag/path revalidation (and leave the UI
  // stuck until a manual refresh).
  for (const tag of config.tags) {
    revalidateTag(tag, "max");
  }
  for (const path of config.paths) {
    revalidatePath(path);
  }

  const controlPlane = CONTROL_PLANE_INVALIDATION[table];
  const invalidateNavMetrics = ["orders", "order_items", "payments", "shipments", "mithron_products"].includes(table);
  const invalidateCatalog = CATALOG_REALTIME_TABLES.has(table);
  const invalidateCms = CMS_REALTIME_TABLES.has(table);

  after(async () => {
    const startedAt = Date.now();
    if (controlPlane) {
      await invalidateControlPlaneRedisCaches(controlPlane);
    } else if (invalidateNavMetrics) {
      await deleteCachedKeys([REDIS_CACHE_KEYS.adminNavMetrics, REDIS_CACHE_KEYS.warehouseNavMetrics]);
    }

    if (invalidateCatalog) {
      await invalidateCatalogRedisCaches();
    }
    if (invalidateCms) {
      await invalidateCmsRedisCaches();
    }

    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= 500) {
      console.warn(`[mithron-cache] revalidateControlPlaneRealtime(${table}) redis phase took ${elapsedMs}ms`);
    }
  });
}

export async function revalidateAfterMutation(...tables: string[]) {
  const uniqueTables = [...new Set(tables.filter(Boolean))];
  if (!uniqueTables.length) return;

  // De-dupe tag/path + Redis invalidation work across all affected tables.
  // A single mutation often calls revalidateAfterMutation("orders","order_items","shipments"...),
  // which previously repeated the same Redis invalidation wave multiple times.
  const unionTags = new Set<string>();
  const unionPaths = new Set<string>();

  const controlPlaneUnion: Partial<{
    adminDashboard: boolean;
    warehouseSnapshots: boolean;
    inventoryMetrics: boolean;
    navMetrics: boolean;
    supplierNavMetrics: boolean;
    productManagerSnapshot: boolean;
    suppliersSnapshot: boolean;
    cmsSnapshots: boolean;
    adminEnquiries: boolean;
    adminReviews: boolean;
    adminBlog: boolean;
    adminWarehouses: boolean;
    csvInventory: boolean;
  }> = {};

  let needsCatalog = false;
  let needsCms = false;
  let needsNavMetricsDeleteFallback = false;

  for (const table of uniqueTables) {
    const config = TABLE_REVALIDATION[table] ?? {
      tags: ["admin-dashboard"],
      paths: ["/admin"]
    };

    for (const tag of config.tags) unionTags.add(tag);
    for (const path of config.paths) unionPaths.add(path);

    const controlPlane = CONTROL_PLANE_INVALIDATION[table];
    if (controlPlane) {
      for (const [key, value] of Object.entries(controlPlane)) {
        if (value) (controlPlaneUnion as Record<string, boolean>)[key] = true;
      }
    } else if (
      ["orders", "order_items", "payments", "shipments", "mithron_products"].includes(table)
    ) {
      needsNavMetricsDeleteFallback = true;
    }

    if (CATALOG_REALTIME_TABLES.has(table)) needsCatalog = true;
    if (CMS_REALTIME_TABLES.has(table)) needsCms = true;
  }

  // Cheap, in-process Next.js cache invalidation first so Redis cannot
  // prevent UI refresh/revalidation from happening.
  for (const tag of unionTags) {
    revalidateTag(tag, "max");
  }
  for (const path of unionPaths) {
    revalidatePath(path);
  }

  after(async () => {
    const controlPlaneKeys = Object.keys(controlPlaneUnion);
    if (controlPlaneKeys.length) {
      await invalidateControlPlaneRedisCaches(controlPlaneUnion);
    } else if (needsNavMetricsDeleteFallback) {
      await deleteCachedKeys([REDIS_CACHE_KEYS.adminNavMetrics, REDIS_CACHE_KEYS.warehouseNavMetrics]);
    }

    if (needsCatalog) {
      await invalidateCatalogRedisCaches();
    }
    if (needsCms) {
      await invalidateCmsRedisCaches();
    }
  });
}
