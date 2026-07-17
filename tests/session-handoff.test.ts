import { describe, expect, it } from "vitest";
import {
  SESSION_HANDOFF_ROLE_HEADER,
  SESSION_HANDOFF_USER_HEADER,
  SESSION_HANDOFF_VERIFIED_HEADER
} from "@/lib/auth/session-handoff";

describe("session handoff headers", () => {
  it("uses stable header names for middleware to RSC auth delegation", () => {
    expect(SESSION_HANDOFF_USER_HEADER).toBe("x-mithron-auth-user-id");
    expect(SESSION_HANDOFF_ROLE_HEADER).toBe("x-mithron-auth-role");
    expect(SESSION_HANDOFF_VERIFIED_HEADER).toBe("x-mithron-auth-verified");
  });
});
