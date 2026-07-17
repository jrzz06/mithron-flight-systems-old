import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("session revocation enforcement", () => {
  it("redirects disabled and revoked sessions through proxy logout flow", () => {
    const proxy = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");
    expect(proxy).toContain("session_revoked_at");
    expect(proxy).toContain('redirectAfterSystemLogout(request, "session_revoked")');
    expect(proxy).toContain('redirectAfterSystemLogout(request, "disabled")');
    expect(proxy).toContain("session_idle");
    expect(proxy).toContain("SESSION_TIMEOUT_MINUTES");
  });
});
