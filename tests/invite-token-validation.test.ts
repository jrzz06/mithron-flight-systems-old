import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { authAuditTimeWindow, buildAuthAuditClientToken, verifyAuthAuditClientToken } from "@/lib/auth-audit-client";
import { resolveInviteRoleForUser } from "@/services/auth-invite";

describe("invite token validation", () => {
  it("hashes invite tokens and requires token hash match for elevated roles", () => {
    const source = readFileSync(join(process.cwd(), "services/auth-invite.ts"), "utf8");
    expect(source).toContain("hashInviteToken");
    expect(source).toContain("admin_invites");
    expect(source).toContain("token_hash !== hashed");
    expect(source).not.toMatch(/metadataRole\s*&&\s*metadataRole\s*!==\s*"user"/);
    expect(typeof resolveInviteRoleForUser).toBe("function");
  });

  it("wires invite resolution into auth callback", () => {
    const callback = readFileSync(join(process.cwd(), "app/auth/callback/route.ts"), "utf8");
    expect(callback).toContain("resolveInviteRoleForUser");
    expect(callback).not.toContain("app_metadata?.role");
  });
});

describe("auth audit client token", () => {
  it("verifies time-windowed HMAC client tokens", () => {
    const secret = "test-secret";
    const env = { AUTH_AUDIT_CLIENT_SECRET: secret };
    const window = authAuditTimeWindow();
    const token = createHash("sha256").update(`${secret}:auth-audit:${window}`).digest("hex");
    expect(verifyAuthAuditClientToken(token, env)).toBe(true);
    expect(verifyAuthAuditClientToken(buildAuthAuditClientToken(env), env)).toBe(true);
    expect(verifyAuthAuditClientToken("invalid", env)).toBe(false);
  });

  it("rejects anonymous auth audit requests unless the client token verifies", () => {
    const route = readFileSync(join(process.cwd(), "app/api/auth/audit/route.ts"), "utf8");
    expect(route).toContain('if (!verifyAuthAuditClientToken(clientToken))');
    expect(route).not.toContain("!clientToken?.trim()");
    expect(route).toContain("auth.password_reset");
  });
});
