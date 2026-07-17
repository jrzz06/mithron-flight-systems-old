import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("observability log pruning route", () => {
  it("supports Vercel cron GET and bearer CRON_SECRET auth", () => {
    const route = readFileSync(join(process.cwd(), "app/api/admin/prune-logs/route.ts"), "utf8");
    const vercel = readFileSync(join(process.cwd(), "vercel.json"), "utf8");

    expect(route).toContain("export async function GET");
    expect(route).toContain("export async function POST");
    expect(route).toContain("authorizeBearerSecret");
    expect(route).toContain("CRON_SECRET");
    expect(route).toContain("prune_observability_logs");
    expect(vercel).toContain("/api/admin/prune-logs");
  });

  it("stops mirroring security events into activity_logs", () => {
    const observability = readFileSync(join(process.cwd(), "services/security-observability.ts"), "utf8");

    expect(observability).toContain("buildSecurityEventDedupeKey");
    expect(observability).not.toContain('entity_table: "security_events"');
    expect(observability).toContain("3_600_000");
  });
});
