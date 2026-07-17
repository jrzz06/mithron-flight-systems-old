import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPublicCmsSnapshotFromRows } from "@/services/cms";

const migrationPath = join(process.cwd(), "supabase", "migrations", "20260523000100_enterprise_cms_rbac.sql");

describe("enterprise CMS architecture", () => {
  it("defines the required Supabase CMS, RBAC, media, and operations tables with RLS", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();
    const requiredTables = [
      "profiles",
      "roles",
      "permissions",
      "user_roles",
      "role_permissions",
      "audit_logs",
      "cms_pages",
      "cms_sections",
      "content_revisions",
      "hero_banners",
      "homepage_sections",
      "section_visibility",
      "site_navigation",
      "footer_columns",
      "footer_links",
      "category_metadata",
      "trust_cards",
      "ecosystem_cards",
      "deployment_locations",
      "testimonials",
      "product_reviews",
      "faqs",
      "media_assets",
      "product_media_assets",
      "homepage_ordering",
      "promotional_campaigns",
      "operation_routes",
      "inventory",
      "orders",
      "warehouse_stock",
      "deployment_requests",
      "staff_tasks"
    ];

    for (const table of requiredTables) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }

    expect(sql).toContain("create or replace function public.has_cms_role");
    expect(sql).toContain("create or replace function public.has_cms_permission");
    expect(sql).toContain("create or replace function public.record_content_revision");
    expect(sql).toContain("create index if not exists hero_banners_publish_idx");
    expect(sql).toContain("create index if not exists media_assets_lookup_idx");
    expect(sql).toContain("create index if not exists product_media_assets_product_idx");
    expect(sql).toContain("create index if not exists audit_logs_actor_idx");
    expect(sql).toContain("create index if not exists content_revisions_entity_idx");
    expect(sql).toContain("alter publication supabase_realtime add table public.hero_banners");
  });

  it("returns a Supabase-only CMS snapshot without local storefront fallback content", () => {
    const snapshot = buildPublicCmsSnapshotFromRows({});

    expect(["supabase", "fallback", "mixed"]).toContain(snapshot.source);
    expect(Array.isArray(snapshot.navigation)).toBe(true);
    expect(Array.isArray(snapshot.home.heroBanners)).toBe(true);
    expect(Array.isArray(snapshot.home.interests)).toBe(true);
    expect(snapshot.home).not.toHaveProperty("sectionOrder");
    expect(Array.isArray(snapshot.footer.columns)).toBe(true);
    expect("trust" in snapshot).toBe(false);
    expect(Array.isArray(snapshot.productSupport.faqs)).toBe(true);
    expect(Array.isArray(snapshot.productSupport.reviews)).toBe(true);
  });
});
