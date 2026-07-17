import { NextResponse } from "next/server";
import { validateCheckoutLeadRequestBody } from "@/lib/api/checkout-schema";
import { requireClientAuditToken } from "@/lib/api/require-client-audit-token";
import { formatContactRequestReference } from "@/lib/contact-requests/shared";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { createClient } from "@/lib/server";
import { submitContactRequest } from "@/services/contact-requests";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readIdempotencyKey(request: Request) {
  const header = request.headers.get("x-idempotency-key")?.trim() ?? "";
  return UUID_V4.test(header) ? header : null;
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.json().catch(() => null);
    const validated = validateCheckoutLeadRequestBody(rawBody);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }
    const body = validated.data;
    const idempotencyKey = readIdempotencyKey(request);

    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;

    const rateKey = userId ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
    const limit = await checkDistributedRateLimit(`checkout-lead:${rateKey}`, 12, 60_000);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    if (!userId) {
      const audit = requireClientAuditToken(request);
      if (!audit.ok) {
        return NextResponse.json({ error: audit.error }, { status: 401 });
      }
    }

    const productSummary = body.items
      .map((item) => `${item.productName?.trim() || item.productSlug} × ${item.quantity}`)
      .join(", ");
    const primaryProduct = body.items[0];
    const productName = primaryProduct?.productName?.trim()
      || (body.items.length > 1 ? productSummary : primaryProduct?.productSlug)
      || null;
    const subject = body.source === "buy_now"
      ? `Buy Now lead${productName ? `: ${productName}` : ""}`
      : `Checkout lead${productName ? `: ${productName}` : ""}`;
    const message = body.source === "buy_now"
      ? `Buy Now lead submitted for ${productSummary}.`
      : `Checkout lead submitted for ${productSummary}.`;

    const contactRequest = await submitContactRequest(
      {
        customerUserId: userId,
        customerEmail: body.email,
        customerPhone: body.phone,
        customerFullName: body.fullName,
        customerCompany: body.company ?? null,
        subject,
        body: message,
        region: body.region ?? null,
        source: body.source,
        productName,
        relatedProductSlug: primaryProduct?.productSlug ?? null,
        idempotencyKey
      },
      null
    );

    const contactRequestId = String(contactRequest.id ?? "");
    const requestNumber = typeof contactRequest.request_number === "number"
      ? contactRequest.request_number
      : Number(contactRequest.request_number);

    return NextResponse.json({
      ok: true,
      contactRequestId: contactRequestId || null,
      requestNumber: Number.isFinite(requestNumber) && requestNumber > 0 ? requestNumber : null,
      reference: formatContactRequestReference(
        Number.isFinite(requestNumber) && requestNumber > 0 ? requestNumber : null
      )
    });
  } catch (error) {
    console.error("[checkout-lead] failed", error);
    const message = error instanceof Error ? error.message : "Could not save contact details.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
