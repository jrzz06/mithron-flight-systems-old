import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("proxy session handoff hardening", () => {
  const proxySource = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");

  it("strips inbound client-supplied session handoff headers before forwarding", () => {
    expect(proxySource).toContain("requestHeaders.delete(SESSION_HANDOFF_USER_HEADER)");
    expect(proxySource).toContain("requestHeaders.delete(SESSION_HANDOFF_ROLE_HEADER)");
    expect(proxySource).toContain("requestHeaders.delete(SESSION_HANDOFF_VERIFIED_HEADER)");
  });

  it("injects verified handoff onto request headers (not response headers only)", () => {
    expect(proxySource).toContain("NextResponse.next({ request: { headers: requestHeaders } })");
    expect(proxySource).toMatch(/requestHeaders\.set\(SESSION_HANDOFF_USER_HEADER/);
    expect(proxySource).toMatch(/requestHeaders\.set\(SESSION_HANDOFF_ROLE_HEADER/);
    expect(proxySource).toMatch(/requestHeaders\.set\(SESSION_HANDOFF_VERIFIED_HEADER/);
  });

  it("control-plane layouts resolve auth via getCurrentAuthContext (JWT cross-check)", () => {
    for (const layout of ["app/admin/layout.tsx", "app/warehouse/layout.tsx", "app/supplier/layout.tsx"]) {
      const layoutSource = readFileSync(join(process.cwd(), layout), "utf8");
      expect(layoutSource).toContain("getCurrentAuthContext");
      expect(layoutSource).not.toContain("readSessionHandoff");
    }
  });
});
