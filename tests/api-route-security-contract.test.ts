import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

type RouteSecurityCategory =
  | "public_rate_limited"
  | "public_ai_rate_limited"
  | "public_post_body"
  | "session_auth"
  | "session_or_guest_auth"
  | "staff_permission_auth"
  | "staff_route_auth"
  | "bearer_secret"
  | "staff_bearer_jwt"
  | "token_auth"
  | "dev_only"
  | "health";

const ROUTE_CATEGORIES: Record<string, RouteSecurityCategory> = {
  "app/api/client-verification/route.ts": "public_rate_limited",
  "app/api/catalog/search/route.ts": "public_rate_limited",
  "app/api/products/summary/route.ts": "public_rate_limited",
  "app/api/ai/assistant/route.ts": "public_ai_rate_limited",
  "app/api/supplier/nav-metrics/route.ts": "staff_route_auth",
  "app/api/warehouse/nav-metrics/route.ts": "staff_route_auth",
  "app/api/cart/pricing/route.ts": "public_rate_limited",
  "app/api/checkout/route.ts": "public_rate_limited",
  "app/api/checkout/enquiry/route.ts": "public_rate_limited",
  "app/api/checkout/lead/route.ts": "session_or_guest_auth",
  "app/api/checkout/status/route.ts": "session_or_guest_auth",
  "app/api/checkout/success/route.ts": "session_or_guest_auth",
  "app/api/auth/login/route.ts": "public_rate_limited",
  "app/api/auth/signup/route.ts": "public_rate_limited",
  "app/api/auth/forgot-password/route.ts": "public_rate_limited",
  "app/api/auth/send-otp/route.ts": "public_rate_limited",
  "app/api/auth/verify-otp/route.ts": "public_rate_limited",
  "app/api/auth/resend-verification/route.ts": "public_rate_limited",
  "app/api/auth/change-email/route.ts": "public_rate_limited",
  "app/api/auth/hooks/send-email/route.ts": "public_rate_limited",
  "app/api/auth/audit/route.ts": "public_rate_limited",
  "app/api/csp-report/route.ts": "public_rate_limited",
  "app/api/contact-requests/route.ts": "session_or_guest_auth",
  "app/api/products/enquiry/route.ts": "session_or_guest_auth",
  "app/api/products/[slug]/reviews/route.ts": "public_rate_limited",
  "app/api/products/[slug]/reviews/[reviewId]/helpful/route.ts": "public_rate_limited",
  "app/api/orders/track/route.ts": "public_rate_limited",
  "app/api/payments/webhooks/[provider]/route.ts": "public_rate_limited",
  "app/api/payments/providers/route.ts": "public_rate_limited",
  "app/api/payments/verify/route.ts": "public_rate_limited",
  "app/api/invoices/[orderId]/route.ts": "session_or_guest_auth",
  "app/api/account/addresses/route.ts": "session_auth",
  "app/api/account/cart/route.ts": "session_auth",
  "app/api/account/cart/items/route.ts": "session_auth",
  "app/api/account/contact-defaults/route.ts": "session_auth",
  "app/api/account/reviews/route.ts": "session_auth",
  "app/api/notifications/route.ts": "session_auth",
  "app/api/notifications/read/route.ts": "session_auth",
  "app/api/admin/prune-logs/route.ts": "bearer_secret",
  "app/api/admin/prune-redis-ttls/route.ts": "bearer_secret",
  "app/api/admin/archive-movements/route.ts": "bearer_secret",
  "app/api/admin/archive-operational-data/route.ts": "bearer_secret",
  "app/api/admin/publish-scheduled-blog/route.ts": "bearer_secret",
  "app/api/admin/live/[resource]/route.ts": "staff_route_auth",
  "app/api/admin/customers/lookup/route.ts": "session_auth",
  "app/api/admin/catalog/products/route.ts": "staff_route_auth",
  "app/api/admin/nav-metrics/route.ts": "staff_route_auth",
  "app/api/admin/orders/[orderId]/enrichment/route.ts": "staff_route_auth",
  "app/api/notifications/dispatch/route.ts": "bearer_secret",
  "app/api/payments/expire-pending/route.ts": "bearer_secret",
  "app/api/security/denials/route.ts": "staff_bearer_jwt",
  "app/api/upload/route.ts": "token_auth",
  "app/api/editor/ai/route.ts": "staff_route_auth",
  "app/api/editor/upload-image/route.ts": "staff_permission_auth",
  "app/api/dev/load-test/route.ts": "dev_only",
  "app/api/health/route.ts": "health",
  "app/api/inngest/route.ts": "public_rate_limited",
  "app/api/jobs/qstash/route.ts": "bearer_secret"
};

const CATEGORY_REQUIREMENTS: Record<RouteSecurityCategory, RegExp[]> = {
  public_rate_limited: [/checkDistributedRateLimit/],
  public_ai_rate_limited: [/checkAssistantRateLimits/, /shouldRefuseConversation|enforceAssistantOutputPolicy/],
  public_post_body: [/NextResponse\.json/, /request\.json/],
  session_auth: [/getClaims|getUser|getCurrentAuthContext/, /checkDistributedRateLimit/],
  session_or_guest_auth: [/getClaims/, /checkDistributedRateLimit/, /requireClientAuditToken|assertInvoiceOrderAccess|fetchCheckoutOrderStatus/],
  staff_permission_auth: [/requirePermission/, /checkDistributedRateLimit/],
  staff_route_auth: [/requirePermission|requireRouteAccess|getCurrentAuthContext|assertRolePermission|requireEditorAiPermission/],
  bearer_secret: [/authorizeBearerSecret|safeBearerEquals/],
  staff_bearer_jwt: [/getUser\(/, /checkDistributedRateLimit/],
  token_auth: [/safeTokenEquals|safeBearerEquals/, /checkDistributedRateLimit/],
  dev_only: [/NODE_ENV\s*===\s*["']production["']/],
  health: [/safeBearerEquals|authorizeBearerSecret/]
};

function listApiRouteFiles(dir: string, root = dir): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listApiRouteFiles(fullPath, root));
      continue;
    }
    if (entry === "route.ts") {
      files.push(relative(root, fullPath).replace(/\\/g, "/"));
    }
  }

  return files.sort();
}

describe("API route security contract", () => {
  it("classifies every app/api route with required security controls", () => {
    const root = process.cwd();
    const apiRoot = join(root, "app", "api");
    const routes = listApiRouteFiles(apiRoot, root);

    expect(routes.length).toBeGreaterThan(0);

    const unclassified = routes.filter((route) => !ROUTE_CATEGORIES[route]);
    expect(unclassified, `Unclassified API routes: ${unclassified.join(", ")}`).toEqual([]);

    for (const route of routes) {
      const category = ROUTE_CATEGORIES[route];
      const source = readFileSync(join(root, route), "utf8");
      const requirements = CATEGORY_REQUIREMENTS[category];

      for (const pattern of requirements) {
        expect(source, `${route} missing ${pattern}`).toMatch(pattern);
      }
    }
  });
});
