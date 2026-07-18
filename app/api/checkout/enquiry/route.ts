import { NextResponse } from "next/server";
import { validateCheckoutEnquiryRequestBody } from "@/lib/api/checkout-schema";
import { requireClientAuditToken } from "@/lib/api/require-client-audit-token";
import { formatLeadReference } from "@/lib/leads/shared";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { createClient } from "@/lib/server";
import { assertCustomerAddressBelongsToUser } from "@/services/customer-addresses";
import { createCustomerCheckoutNotificationRecord } from "@/services/admin-actions";
import { getCheckoutPricingBySlugs } from "@/services/catalog";
import { submitLead } from "@/services/leads";
import { resolveCheckoutStockSkus } from "@/services/checkout-stock";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readIdempotencyKey(request: Request) {
  const header = request.headers.get("x-idempotency-key")?.trim() ?? "";
  return UUID_V4.test(header) ? header : null;
}

function formatGuestAddress(address?: {
  line1?: string;
  city?: string;
  region?: string;
  postalCode?: string;
} | null) {
  if (!address) return null;
  return [address.line1, address.city, address.region, address.postalCode]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join(", ") || null;
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.json().catch(() => null);
    const validated = validateCheckoutEnquiryRequestBody(rawBody);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }
    const body = validated.data;
    const idempotencyKey = readIdempotencyKey(request);

    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;

    const rateKey = userId ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
    const limit = await checkDistributedRateLimit(`checkout-enquiry:${rateKey}`, 8, 60_000);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    if (!userId) {
      const audit = requireClientAuditToken(request);
      if (!audit.ok) {
        return NextResponse.json({ error: audit.error }, { status: 401 });
      }
    }

    if (body.addressId && userId) {
      try {
        await assertCustomerAddressBelongsToUser(userId, body.addressId);
      } catch {
        return NextResponse.json({ error: "Invalid shipping address for this account." }, { status: 403 });
      }
    }

    if (body.addressId && !userId) {
      return NextResponse.json({ error: "Sign in to use a saved address, or enter a shipping address below." }, { status: 400 });
    }

    let stockItems;
    try {
      stockItems = await resolveCheckoutStockSkus(body.items);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to resolve product inventory.";
      return NextResponse.json({ error: message }, { status: 409 });
    }

    const catalog = await getCheckoutPricingBySlugs(body.items.map((item) => item.productSlug));
    const catalogBySlug = new Map(catalog.map((product) => [product.slug, product]));
    const cartLines = stockItems.map((item) => {
      const product = catalogBySlug.get(item.productSlug);
      return {
        product_slug: item.productSlug,
        product_name: product?.name ?? item.productSlug,
        quantity: item.quantity,
        sku: item.sku ?? null
      };
    });

    const primary = cartLines[0];
    const productSummary = cartLines
      .map((line) => `${line.product_name} × ${line.quantity}`)
      .join(", ");

    const lead = await submitLead(
      {
        customerUserId: userId,
        email: body.email,
        phone: body.phone,
        name: body.fullName,
        address: formatGuestAddress(body.guestAddress),
        productSlug: primary?.product_slug ?? null,
        productName: primary?.product_name ?? null,
        message: body.message || `Checkout enquiry for ${productSummary}`,
        source: "checkout_enquiry",
        idempotencyKey,
        payload: {
          company: body.company ?? null,
          region: body.region ?? null,
          cart_lines: cartLines,
          address_id: body.addressId ?? null,
          guest_address: body.guestAddress ?? null,
          guest_billing_address: body.guestBillingAddress ?? null,
          billing_same_as_shipping: body.billingSameAsShipping ?? null
        }
      },
      null
    );

    const leadId = String(lead.id ?? "");
    const leadNumber = typeof lead.lead_number === "number" ? lead.lead_number : Number(lead.lead_number);
    const enquiryReference = formatLeadReference(
      Number.isFinite(leadNumber) && leadNumber > 0 ? leadNumber : null
    );

    if (userId && leadId) {
      try {
        await createCustomerCheckoutNotificationRecord({
          recipient_id: userId,
          channel: "customer",
          title: "Checkout enquiry received",
          body: `We received ${enquiryReference}. Our team will contact you shortly.`,
          status: "unread",
          entity_table: "leads",
          entity_id: leadId,
          metadata: { recipient_email: body.email, order_type: "enquiry" }
        });
      } catch {
        // ignore
      }
    }

    return NextResponse.json({
      ok: true,
      enquiryId: leadId || null,
      leadId: leadId || null,
      enquiryNumber: Number.isFinite(leadNumber) && leadNumber > 0 ? leadNumber : null,
      enquiryReference,
      mode: "enquiry" as const
    });
  } catch (error) {
    console.error("[checkout/enquiry] failed", error);
    const message = error instanceof Error ? error.message : "Could not submit checkout enquiry.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
