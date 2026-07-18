import { NextResponse } from "next/server";
import { validateCheckoutLeadRequestBody } from "@/lib/api/checkout-schema";
import { requireClientAuditToken } from "@/lib/api/require-client-audit-token";
import { formatLeadReference } from "@/lib/leads/shared";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { createClient } from "@/lib/server";
import { submitLead } from "@/services/leads";

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
    const message = body.source === "buy_now"
      ? `Buy Now lead submitted for ${productSummary}.`
      : `Checkout lead submitted for ${productSummary}.`;

    const lead = await submitLead(
      {
        customerUserId: userId,
        email: body.email,
        phone: body.phone,
        name: body.fullName,
        productSlug: primaryProduct?.productSlug ?? null,
        productName,
        message,
        source: "checkout_enquiry",
        idempotencyKey,
        payload: {
          company: body.company ?? null,
          region: body.region ?? null,
          checkout_source: body.source,
          items: body.items
        }
      },
      null
    );

    const leadId = String(lead.id ?? "");
    const leadNumber = typeof lead.lead_number === "number" ? lead.lead_number : Number(lead.lead_number);

    return NextResponse.json({
      ok: true,
      contactRequestId: leadId || null,
      leadId: leadId || null,
      requestNumber: Number.isFinite(leadNumber) && leadNumber > 0 ? leadNumber : null,
      reference: formatLeadReference(
        Number.isFinite(leadNumber) && leadNumber > 0 ? leadNumber : null
      )
    });
  } catch (error) {
    console.error("[checkout-lead] failed", error);
    const message = error instanceof Error ? error.message : "Could not save contact details.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
