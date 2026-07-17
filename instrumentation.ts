export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initSentry } = await import("@/lib/sentry");
    initSentry();
  }

  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { isPaymentGatewayConfigured } = await import("@/services/payments/gateway");
  if (isPaymentGatewayConfigured()) {
    const { assertPaymentEnvironment, logPaymentEnvironmentWarnings } = await import(
      "@/services/payments/env-validation"
    );
    logPaymentEnvironmentWarnings();
    assertPaymentEnvironment();
  }

  if (process.env.NODE_ENV === "production") {
    const { assertProductionRuntimeConfig } = await import("@/lib/env");
    assertProductionRuntimeConfig();
  }
}

type RequestErrorInfo = {
  path?: string;
  method?: string;
};

type RequestErrorContext = {
  routerKind?: string;
  routePath?: string;
  routeType?: string;
};

/**
 * Server-side error tracking. Next.js invokes this for uncaught server errors
 * (Server Components, Route Handlers, Server Actions). Emits a structured log
 * with a stable prefix so production 5xx/exceptions can be alerted on via log
 * drains, and mirrors the error into the security_events sink. Swap the body
 * for Sentry.captureException here if/when an APM vendor is adopted.
 */
export async function onRequestError(
  error: unknown,
  request: RequestErrorInfo,
  context: RequestErrorContext
) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  const path = request?.path ?? context?.routePath ?? "unknown";
  const method = request?.method ?? "unknown";

  console.error(
    "[mithron-server-error]",
    JSON.stringify({
      path,
      method,
      route: context?.routePath ?? null,
      routeType: context?.routeType ?? null,
      message,
      stack: stack?.split("\n").slice(0, 5).join("\n") ?? null
    })
  );

  try {
    const { captureServerException } = await import("@/lib/sentry");
    captureServerException(error, { path, method, route: context?.routePath ?? null });
  } catch {
    // Sentry is optional — never block error reporting.
  }

  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { recordSecurityEvent } = await import("@/services/security-observability");
    await recordSecurityEvent({
      eventType: "system.server_error",
      attemptedResource: path,
      routePath: context?.routePath ?? path,
      httpStatus: 500,
      severity: "critical",
      source: "instrumentation",
      denialReason: message.slice(0, 500),
      metadata: {
        method,
        route_type: context?.routeType ?? null,
        router_kind: context?.routerKind ?? null
      }
    });
  } catch (recordError) {
    console.error("[mithron-server-error] Failed to persist server error event.", recordError);
  }
}
