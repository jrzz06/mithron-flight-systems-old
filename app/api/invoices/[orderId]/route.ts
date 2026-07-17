import { NextResponse } from "next/server";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { getStoredInvoiceHtml } from "@/lib/invoice/generate-invoice";
import { assertInvoiceOrderAccess } from "@/lib/invoice/order-access";
import { createClient } from "@/lib/server";

export async function GET(
  request: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await context.params;
  const trimmedOrderId = orderId?.trim() ?? "";
  if (!trimmedOrderId) {
    return NextResponse.json({ error: "Order id is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  const email = new URL(request.url).searchParams.get("email") ?? undefined;

  const rateKey = userId ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const limit = await checkDistributedRateLimit(`invoice:${rateKey}`, 20, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const access = await assertInvoiceOrderAccess({
    orderId: trimmedOrderId,
    userId,
    email,
    request
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const paymentStatus = String(access.order.payment_status ?? "");
  if (paymentStatus !== "succeeded") {
    return NextResponse.json({ error: "Invoice is available after successful payment." }, { status: 404 });
  }

  const invoiceHtml = await getStoredInvoiceHtml(trimmedOrderId);
  if (!invoiceHtml) {
    return NextResponse.json({ error: "Invoice not generated yet." }, { status: 404 });
  }

  return new NextResponse(invoiceHtml, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store"
    }
  });
}
