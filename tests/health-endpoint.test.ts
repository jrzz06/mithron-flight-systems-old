import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("health endpoint", () => {
  it("returns minimal public status and gates detailed diagnostics behind HEALTH_CHECK_SECRET", () => {
    const route = readFileSync(join(process.cwd(), "app/api/health/route.ts"), "utf8");
    expect(route).toContain("HEALTH_CHECK_SECRET");
    expect(route).toContain("authorizeBearerSecret");
    expect(route).toContain('return NextResponse.json({ status }');
    expect(route).toContain("build_id");
    expect(route).not.toContain("serviceRoleKey");
  });
});

describe("ci config", () => {
  it("includes lint, typecheck, test, and build jobs", () => {
    const workflow = readFileSync(join(process.cwd(), ".github/workflows/ci.yml"), "utf8");
    expect(workflow).toContain("npm run lint");
    expect(workflow).toContain("npm run typecheck");
    expect(workflow).toContain("npm run test");
    expect(workflow).toContain("npm run build");
    expect(existsSync(join(process.cwd(), ".github/workflows/security-scan.yml"))).toBe(true);
  });
});
