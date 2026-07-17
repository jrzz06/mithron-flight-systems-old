import { NextResponse } from "next/server";
import { parseProductEnquiryRequestBody } from "@/lib/api/product-enquiry-schema";
import { requireClientAuditToken } from "@/lib/api/require-client-audit-token";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { createClient } from "@/lib/server";
import { createCustomerCheckoutNotificationRecord } from "@/services/admin-actions";
import { formatEnquiryReference, submitProductPageEnquiry } from "@/services/enquiries";

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
      return NextResponse.json({ ok: true, enquiryId: null });
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

    const enquiry = await submitProductPageEnquiry(
      {
        customerUserId: userId,
        customerEmail: body.email,
        customerPhone: body.phone,
        customerFullName: body.fullName,
        customerCompany: body.company ?? null,
        subject: `Product enquiry: ${body.productName}`,
        body: body.message ?? "",
        relatedProductSlug: body.productSlug,
        region: body.region,
        productName: body.productName,
        productSku: body.productSku,
        preferredContactMethod: body.preferredContactMethod,
        sku: body.productSku,
        image: body.image ?? null,
        productUrl: body.productUrl ?? null,
        quantity: body.quantity,
        ...(body.shippingAddress ? { shippingAddress: body.shippingAddress } : {}),
        ...(body.billingAddress ? { billingAddress: body.billingAddress } : {}),
        ...(body.billingSameAsShipping !== undefined
          ? { billingSameAsShipping: body.billingSameAsShipping }
          : {})
      },
      null
    );

    const enquiryId = String(enquiry.id ?? "");
    const enquiryNumber = typeof enquiry.enquiry_number === "number"
      ? enquiry.enquiry_number
      : Number(enquiry.enquiry_number);
    const enquiryReference = formatEnquiryReference(
      Number.isFinite(enquiryNumber) && enquiryNumber > 0 ? enquiryNumber : null
    );

    if (userId && enquiryId) {
      try {
        await createCustomerCheckoutNotificationRecord({
          recipient_id: userId,
          channel: "customer",
          title: "Product enquiry received",
          body: `We received ${enquiryReference} for ${body.productName}. Our team will contact you shortly.`,
          status: "unread",
          entity_table: "enquiries",
          entity_id: enquiryId,
          metadata: { recipient_email: body.email, order_type: "enquiry" }
        });
      } catch {
        // Notification failures should not block enquiry submissions.
      }
    }

    return NextResponse.json({
      ok: true,
      enquiryId: enquiryId || null,
      enquiryReference
    });
  } catch (error) {
    console.error("[products/enquiry] failed", error);
    const message = error instanceof Error ? error.message : "Could not submit product enquiry.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
