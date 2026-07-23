import { headers } from "next/headers";
import { unwrapAuthNextPath } from "@/lib/auth/redirects";
import { getSiteOrigin, sanitizeAppOrigin } from "@/lib/site-url";

type HeaderSource = Pick<Headers, "get">;

function resolveOriginFromHeaderSource(headerSource: HeaderSource) {
  const forwardedHost = headerSource.get("x-forwarded-host");
  const host = forwardedHost?.split(",")[0]?.trim() ?? headerSource.get("host")?.trim();
  if (!host) return getSiteOrigin();

  const forwardedProto = headerSource.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto
    ?? (host.includes("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");

  return sanitizeAppOrigin(`${protocol}://${host}`) ?? getSiteOrigin();
}

export function resolveRequestOrigin(request: Pick<Request, "headers">) {
  return resolveOriginFromHeaderSource(request.headers);
}

export async function resolveServerRequestOrigin() {
  return resolveOriginFromHeaderSource(await headers());
}

export function buildAuthCallbackUrl(origin: string, nextPath: string) {
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", unwrapAuthNextPath(nextPath, "/"));
  return callback.toString();
}

export function buildPasswordResetUrl(origin: string) {
  return new URL("/reset-password", origin).toString();
}

export function buildAuthConfirmUrl(origin: string, nextPath: string) {
  const confirm = new URL("/auth/confirm", origin);
  confirm.searchParams.set("next", unwrapAuthNextPath(nextPath, "/account"));
  return confirm.toString();
}

function isSameAppOrigin(candidate: string, origin: string) {
  try {
    return sanitizeAppOrigin(new URL(candidate).origin) === sanitizeAppOrigin(origin);
  } catch {
    return false;
  }
}

export function resolveAuthRedirectUrlFromRequest(
  request: Pick<Request, "headers">,
  input: {
    clientRedirectTo?: string;
    defaultPath: string;
    defaultNext?: string;
  }
) {
  const origin = resolveRequestOrigin(request);
  const clientRedirectTo = input.clientRedirectTo?.trim() ?? "";

  if (clientRedirectTo) {
    if (clientRedirectTo.startsWith("/") && !clientRedirectTo.startsWith("//")) {
      return new URL(clientRedirectTo, origin).toString();
    }

    if (isSameAppOrigin(clientRedirectTo, origin)) {
      return clientRedirectTo;
    }
  }

  if (input.defaultPath === "/auth/callback") {
    return buildAuthCallbackUrl(origin, input.defaultNext ?? "/");
  }

  return new URL(input.defaultPath, origin).toString();
}
