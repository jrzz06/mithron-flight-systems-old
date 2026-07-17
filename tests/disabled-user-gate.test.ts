import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ProfileDisabledError } from "@/lib/auth/profile-disabled";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("disabled user gate", () => {
  it("defines ProfileDisabledError for governance blocks", () => {
    const error = new ProfileDisabledError();
    expect(error.name).toBe("ProfileDisabledError");
    expect(error.message).toMatch(/disabled/i);
  });

  it("blocks disabled profiles in provisioning without reactivation", () => {
    const provisioning = source("services/auth-provisioning.ts");
    expect(provisioning).toContain("ProfileDisabledError");
    expect(provisioning).toContain('governance_status === "disabled"');
    expect(provisioning).not.toMatch(/disabled[\s\S]{0,120}governance_status:\s*"active"/);
  });

  it("enforces disabled and session revocation in auth context and proxy", () => {
    const auth = source("services/auth.ts");
    const proxy = source("proxy.ts");
    expect(auth).toContain("session_revoked_at");
    expect(auth).toContain("disabled: true");
    expect(proxy).toContain("governance_status");
    expect(proxy).toContain("session_revoked_at");
    expect(proxy).toContain('redirectAfterSystemLogout(request, "disabled")');
  });
});
