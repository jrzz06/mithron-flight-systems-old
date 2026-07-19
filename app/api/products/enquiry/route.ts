import { NextResponse } from "next/server";
import { parseProductEnquiryRequestBody } from "@/lib/api/product-enquiry-schema";
import { requireClientAuditToken } from "@/lib/api/require-client-audit-token";
import { formatLeadReference } from "@/lib/leads/shared";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { createClient } from "@/lib/server";
import { createCustomerCheckoutNotificationRecord } from "@/services/admin-actions";
import { submitLead } from "@/services/leads";

function formatAddress(address?: {
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
    const body = parseProductEnquiryRequestBody(rawBody);
    if (!body) {
      return NextResponse.json({
        error: "Full name, email, phone, product details, and preferred contact method are required."
      }, { status: 400 });
    }
    if (!body.productSlug && !body.email) {
      return NextResponse.json({ ok: true, enquiryId: null, leadId: null });
    }

    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;

    const rateKey = userId ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
    const limit = await checkDistributedRateLimit(`product-enquiry:${rateKey}`, 8, 60_000);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    if (!userId) {
      const audit = requireClientAuditToken(request);
      if (!audit.ok) {
        return NextResponse.json({ error: audit.error }, { status: 401 });
      }
    }

    const lead = await submitLead(
      {
        customerUserId: userId,
        email: body.email,
        phone: body.phone,
        name: body.fullName,
        address: formatAddress(body.shippingAddress),
        productSlug: body.productSlug,
        productName: body.productName,
        message: body.message ?? `Product enquiry: ${body.productName}`,
        source: "product_enquiry",
        payload: {
          company: body.company ?? null,
          region: body.region,
          product_sku: body.productSku,
          preferred_contact_method: body.preferredContactMethod,
          quantity: body.quantity,
          image: body.image ?? null,
          product_url: body.productUrl ?? null,
          shipping_address: body.shippingAddress ?? null,
          billing_address: body.billingAddress ?? null,
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
          title: "Product enquiry received",
          body: `We received ${enquiryReference} for ${body.productName}. Our team will contact you shortly.`,
          status: "unread",
          entity_table: "leads",
          entity_id: leadId,
          metadata: { recipient_email: body.email, order_type: "enquiry" }
        });
      } catch {
        // Notification failures should not block enquiry submissions.
      }
    }

    return NextResponse.json({
      ok: true,
      enquiryId: leadId || null,
      leadId: leadId || null,
      enquiryReference
    });
  } catch (error) {
    console.error("[products/enquiry] failed", error);
    return NextResponse.json({ error: "Could not submit product enquiry." }, { status: 500 });
  }
}
