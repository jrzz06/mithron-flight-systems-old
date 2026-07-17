"use client";

type ClientAuthEvent = "auth.login" | "auth.failed_login" | "auth.password_reset" | "auth.invite_accept";

export async function recordClientAuthEvent(
  action: ClientAuthEvent,
  metadata: Record<string, unknown> = {},
  auditToken?: string | null
) {
  try {
    await fetch("/api/auth/audit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(auditToken ? { "x-auth-audit-token": auditToken } : {})
      },
      body: JSON.stringify({ action, metadata }),
      keepalive: true
    });
  } catch {
    // Auth observability cannot block the operator flow.
  }
}
