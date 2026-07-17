import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildEnterpriseCleanupReadiness } from "@/services/enterprise-cleanup";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("production stabilization readiness", () => {
  it("keeps fallback removal blocked until CMS, media, realtime, warehouse, and rollback gates are all true", () => {
    const readiness = buildEnterpriseCleanupReadiness({
      cmsCutoverReady: true,
      cmsParityVerified: true,
      mediaParityVerified: false,
      canonicalMediaRows: 0,
      productMediaLinks: 0,
      realtimeStabilized: true,
      warehouseAuthenticatedVerified: true,
      rollbackRecoveryVerified: false
    });

    expect(readiness.status).toBe("BLOCKED");
    expect(readiness.destructiveCleanupAllowed).toBe(false);
    expect(readiness.safeToRemoveLater).toHaveLength(0);
    expect(readiness.blockers).toEqual(expect.arrayContaining([
      "Canonical media parity is not verified with durable media rows.",
      "Rollback recovery has not been verified for cleanup candidates."
    ]));
  });

  it("keeps account route scoped without legacy account styling or CMS route residue", () => {
    expect(existsSync(join(root, "app", "(storefront)", "account", "page.tsx"))).toBe(true);
    expect(source("app/globals.css")).not.toMatch(/account-(page|panel)/);
    expect(source("services/cms.ts")).not.toContain("LEGACY_PROFILE_ROUTE");
    expect(source("services/cms.ts")).not.toContain('"/account"');
    expect(source("services/cms.ts")).not.toContain('`${"account"}`');
  });

  it("keeps production blocker diagnostics out of the default admin command surface", () => {
    const adminPage = source("app/admin/page.tsx");

    expect(adminPage).not.toContain("data-production-stabilization-panel");
    expect(adminPage).not.toContain("data-production-readiness-blockers");
    expect(adminPage).not.toContain("data-cleanup-remote-counts");
    expect(adminPage).not.toContain("Fallback removal");
    expect(adminPage).not.toContain("Table counts");
    expect(adminPage).toContain("Quick links");
  });
});
