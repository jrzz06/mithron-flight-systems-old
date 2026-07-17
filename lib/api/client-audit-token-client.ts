export async function fetchClientAuditToken() {
  const response = await fetch("/api/client-verification", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store"
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json().catch(() => ({}))) as { token?: unknown };
  return typeof payload.token === "string" && payload.token.trim() ? payload.token.trim() : null;
}

export async function buildGuestRequestHeaders() {
  const token = await fetchClientAuditToken();
  return {
    token,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "x-auth-audit-token": token } : {})
    } as Record<string, string>
  };
}
