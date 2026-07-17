import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ENTERPRISE_CLEANUP_DEPENDENCIES,
  buildEnterpriseCleanupReadiness,
  createCleanupDependencyGraph
} from "@/services/enterprise-cleanup";
import { getEnterpriseCleanupSnapshot } from "@/services/admin";

const root = process.cwd();

describe("enterprise cleanup readiness", () => {
  it("blocks destructive cleanup while parity and rollback gates remain incomplete", () => {
    const readiness = buildEnterpriseCleanupReadiness({
      cmsCutoverReady: true,
      cmsParityVerified: false,
      mediaParityVerified: false,
      canonicalMediaRows: 0,
      productMediaLinks: 0,
      realtimeStabilized: true,
      warehouseAuthenticatedVerified: false,
      rollbackRecoveryVerified: false
    });

    expect(readiness.status).toBe("BLOCKED");
    expect(readiness.destructiveCleanupAllowed).toBe(false);
    expect(readiness.blockers).toEqual(expect.arrayContaining([
      "CMS staged parity and rollback verification are not complete.",
      "Canonical media parity is not verified with durable media rows.",
      "Rollback recovery has not been verified for cleanup candidates."
    ]));
    expect(readiness.dependencies.find((dependency) => dependency.id === "generated-media-manifest")).toMatchObject({
      status: "ACTIVE",
      removalGate: "mediaParity"
    });
    expect(readiness.dependencies.find((dependency) => dependency.id === "cms-local-storefront-content")).toMatchObject({
      status: "FALLBACK_ONLY",
      removalGate: "cmsParity"
    });
  });

  it("maps runtime dependency chains for fallback and rollback systems", () => {
    const graph = createCleanupDependencyGraph(ENTERPRISE_CLEANUP_DEPENDENCIES);

    expect(graph.nodes).toEqual(expect.arrayContaining([
      "services/cms.ts",
      "config/storefront-content.ts",
      "data/mithron-supabase-assets.generated.json",
      "components/media/mithron-responsive-image.tsx",
      "app/admin/products/page.tsx",
      "app/warehouse/fulfillment/page.tsx"
    ]));
    expect(graph.edges).toEqual(expect.arrayContaining([
      { from: "services/cms.ts", to: "config/storefront-content.ts", reason: "CMS fallback content" },
      { from: "components/media/mithron-responsive-image.tsx", to: "data/mithron-supabase-assets.generated.json", reason: "responsive media fallback manifest" },
      { from: "lib/media/canonical-batch-upload.ts", to: "app/api/upload/route.ts", reason: "token-gated batch media upload bypassing admin RBAC" }
    ]));
    expect(ENTERPRISE_CLEANUP_DEPENDENCIES.every((dependency) => dependency.rollbackPlan.length > 0)).toBe(true);
  });

  it("only marks removal candidates safe later after every enterprise gate is verified", () => {
    const readiness = buildEnterpriseCleanupReadiness({
      cmsCutoverReady: true,
      cmsParityVerified: true,
      mediaParityVerified: true,
      canonicalMediaRows: 24,
      productMediaLinks: 24,
      realtimeStabilized: true,
      warehouseAuthenticatedVerified: true,
      rollbackRecoveryVerified: true
    });

    expect(readiness.status).toBe("READY_FOR_STAGED_REMOVAL");
    expect(readiness.destructiveCleanupAllowed).toBe(false);
    expect(readiness.safeToRemoveLater.map((dependency) => dependency.id)).toEqual(expect.arrayContaining([
      "cms-local-storefront-content",
      "generated-media-manifest"
    ]));
    expect(readiness.safeToRemoveLater.every((dependency) => dependency.status === "SAFE_TO_REMOVE_LATER")).toBe(true);
  });

  it("exposes cleanup diagnostics through admin snapshots", async () => {
    const blocked = await getEnterpriseCleanupSnapshot({});
    const adminSource = readFileSync(join(root, "app", "admin", "page.tsx"), "utf8");

    expect(blocked.status).toBe("BLOCKED");
    expect(blocked.data.readiness.destructiveCleanupAllowed).toBe(false);
    expect(adminSource).not.toContain("getEnterpriseCleanupSnapshot");
    expect(adminSource).not.toContain("Cleanup readiness");
    expect(adminSource).toContain("getAdminDashboardSnapshot");
  });
});
