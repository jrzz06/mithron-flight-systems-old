import { NextResponse } from "next/server";
import { validateCheckoutEnquiryRequestBody } from "@/lib/api/checkout-schema";
import { requireClientAuditToken } from "@/lib/api/require-client-audit-token";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { createClient } from "@/lib/server";
import { assertCustomerAddressBelongsToUser } from "@/services/customer-addresses";
import { createCustomerCheckoutNotificationRecord } from "@/services/admin-actions";
import { getCheckoutPricingBySlugs } from "@/services/catalog";
import {
  findCheckoutEnquiryByIdempotencyKey,
  formatEnquiryReference,
  submitCheckoutProductEnquiry
} from "@/services/enquiries";
import { resolveCheckoutStockSkus } from "@/services/checkout-stock";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readIdempotencyKey(request: Request) {
  const header = request.headers.get("x-idempotency-key")?.trim() ?? "";
  return UUID_V4.test(header) ? header : null;
}

function replayCheckoutEnquiryResponse(enquiry: Record<string, unknown>) {
  const enquiryId = String(enquiry.id ?? "");
  const enquiryNumber = typeof enquiry.enquiry_number === "number"
    ? enquiry.enquiry_number
    : Number(enquiry.enquiry_number);
  const enquiryReference = formatEnquiryReference(
    Number.isFinite(enquiryNumber) && enquiryNumber > 0 ? enquiryNumber : null
  );

  return NextResponse.json({
    ok: true,
    enquiryId,
    enquiryNumber: Number.isFinite(enquiryNumber) && enquiryNumber > 0 ? enquiryNumber : null,
    enquiryReference,
    mode: "enquiry" as const,
    replayed: true
  });
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

    if (idempotencyKey) {
      const existing = await findCheckoutEnquiryByIdempotencyKey(
        idempotencyKey,
        userId
          ? { userId }
          : { guestEmail: body.email, guestPhone: body.phone }
      );
      if (existing) {
        return replayCheckoutEnquiryResponse(existing);
      }
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

    const enquiry = await submitCheckoutProductEnquiry(
      {
        customerUserId: userId,
        customerEmail: body.email,
        customerPhone: body.phone,
        customerFullName: body.fullName,
        customerCompany: body.company ?? null,
        enquiryMessage: body.message,
        region: body.region,
        relatedProductSlug: cartLines[0]?.product_slug ?? null,
        cartLines,
        guestAddress: body.guestAddress ?? null,
        addressId: body.addressId ?? null,
        idempotencyKey
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
          body: `We received ${enquiryReference}. Our team will contact you shortly.`,
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
      enquiryId,
      enquiryNumber: Number.isFinite(enquiryNumber) && enquiryNumber > 0 ? enquiryNumber : null,
      enquiryReference,
      mode: "enquiry" as const
    });
  } catch (error) {
    console.error("[checkout-enquiry] failed", error);
    const message = error instanceof Error ? error.message : "Could not send enquiry.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
