import { verifyAuthAuditClientToken } from "@/lib/auth-audit-client";

export function readClientAuditToken(request: Request) {
  return request.headers.get("x-auth-audit-token")
    ?? request.headers.get("x-turnstile-token");
}

export function verifyClientAuditToken(request: Request) {
  return verifyAuthAuditClientToken(readClientAuditToken(request));
}

export function requireClientAuditToken(request: Request) {
  if (!verifyClientAuditToken(request)) {
    return { ok: false as const, error: "Guest verification failed. Refresh the page and try again." };
  }
  return { ok: true as const };
}
