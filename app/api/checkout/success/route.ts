import { NextResponse } from "next/server";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { requireClientAuditToken } from "@/lib/api/require-client-audit-token";
import { createClient } from "@/lib/server";
import { fetchAdminRecordsByColumn } from "@/services/admin-actions";
import { getPaidOrderFulfillment } from "@/services/invoice/payment-fulfillment";

async function assertPaidOrderAccess(input: {
  orderId: string;
  userId: string | null;
  email?: string;
  request: Request;
}) {
  const orders = await fetchAdminRecordsByColumn("orders", "id", input.orderId);
  const order = orders[0];
  if (!order) return { ok: false as const, status: 404, error: "Order not found." };

  if (input.userId) {
    const ownerId = typeof order.created_by_user_id === "string" ? order.created_by_user_id : null;
    if (ownerId === input.userId) {
      return { ok: true as const, order };
    }
    return { ok: false as const, status: 404, error: "Order not found." };
  }

  const audit = requireClientAuditToken(input.request);
  if (!audit.ok) {
    return { ok: false as const, status: 401, error: audit.error };
  }

  const orderEmail = String(order.customer_email ?? "").trim().toLowerCase();
  const requestEmail = input.email?.trim().toLowerCase() ?? "";
  if (!requestEmail || orderEmail !== requestEmail) {
    return { ok: false as const, status: 403, error: "Email does not match order." };
  }

  return { ok: true as const, order };
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const orderId = requestUrl.searchParams.get("orderId")?.trim() ?? "";
  const guestEmail = requestUrl.searchParams.get("email")?.trim() ?? "";

  if (!orderId) {
    return NextResponse.json({ error: "orderId is required." }, { status: 400 });
  }

  const rateKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const limit = await checkDistributedRateLimit(`checkout-success:${rateKey}`, 20, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;

  if (!userId && !guestEmail) {
    return NextResponse.json({ error: "email is required for guest checkout." }, { status: 400 });
  }

  const access = await assertPaidOrderAccess({
    orderId,
    userId,
    email: guestEmail || undefined,
    request
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const paid =
    String(access.order.payment_status ?? "") === "succeeded"
    || String(access.order.status ?? "") === "paid";

  if (!paid) {
    return NextResponse.json({ ok: false, paid: false, error: "Payment is not confirmed yet." }, { status: 409 });
  }

  const fulfillment = await getPaidOrderFulfillment(orderId);
  if (!fulfillment) {
    return NextResponse.json({ error: "Unable to load invoice for this order." }, { status: 500 });
  }

  if (!fulfillment.invoiceReady) {
    return NextResponse.json({
      ok: true,
      paid: true,
      invoicePending: true,
      orderId,
      orderNumber: fulfillment.orderNumber,
      total: fulfillment.total,
      customerEmail: fulfillment.customerEmail,
      emailSent: fulfillment.emailSent,
      emailSkipped: fulfillment.emailSkipped
    });
  }

  const invoiceHref = guestEmail
    ? `${fulfillment.invoiceUrl}?email=${encodeURIComponent(guestEmail)}`
    : fulfillment.invoiceUrl;

  return NextResponse.json({
    ok: true,
    paid: true,
    orderId,
    orderNumber: fulfillment.orderNumber,
    total: fulfillment.total,
    customerEmail: fulfillment.customerEmail,
    invoiceNumber: fulfillment.invoiceNumber,
    invoiceUrl: invoiceHref,
    emailSent: fulfillment.emailSent,
    emailSkipped: fulfillment.emailSkipped
  });
}
