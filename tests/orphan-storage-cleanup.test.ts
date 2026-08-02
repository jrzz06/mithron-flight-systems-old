import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveOrphanStorageApply,
  resolveOrphanStorageMaxPerRun,
  resolveOrphanStorageMinAgeDays
} from "@/services/orphan-storage-cleanup";

describe("orphan storage cleanup", () => {
  it("defaults to dry-run / apply off", () => {
    expect(resolveOrphanStorageApply({})).toBe(false);
    expect(resolveOrphanStorageApply({ ORPHAN_STORAGE_APPLY: "0" })).toBe(false);
    expect(resolveOrphanStorageApply({ ORPHAN_STORAGE_APPLY: "1" })).toBe(true);
    expect(resolveOrphanStorageMinAgeDays({})).toBe(7);
    expect(resolveOrphanStorageMaxPerRun({})).toBe(100);
  });

  it("exposes a cron-auth locked dry-run route", () => {
    const route = readFileSync(join(process.cwd(), "app/api/admin/prune-orphan-storage/route.ts"), "utf8");
    const service = readFileSync(join(process.cwd(), "services/orphan-storage-cleanup.ts"), "utf8");
    const vercel = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
    const envExample = readFileSync(join(process.cwd(), ".env.example"), "utf8");

    expect(route).toContain("authorizeBearerSecret");
    expect(route).toContain("CRON_SECRET");
    expect(route).toContain("withCronLock");
    expect(route).toContain("resolveOrphanStorageApply");
    expect(route).toContain("dryRun: !apply");
    expect(service).toContain("dryRun");
    expect(service).toContain("ORPHAN_STORAGE_APPLY");
    expect(service).toContain("buildReferencedStoragePaths");
    expect(service).toContain("mithron-products");
    expect(vercel).toContain("/api/admin/prune-orphan-storage");
    expect(envExample).toContain("ORPHAN_STORAGE_APPLY");
  });

  it("never force-deletes unless env apply is already enabled", () => {
    const route = readFileSync(join(process.cwd(), "app/api/admin/prune-orphan-storage/route.ts"), "utf8");
    expect(route).toContain("envApply &&");
    expect(route).toContain("never force-delete");
  });
});
