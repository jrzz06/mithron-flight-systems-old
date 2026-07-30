import {
  isValidCustomerEmail,
  isValidCustomerPhone
} from "@/lib/api/customer-contact";
import { buildGuestRequestHeaders } from "@/lib/api/client-audit-token-client";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { deriveProductSku } from "@/lib/product-sku";
import { formatLeadReference } from "@/lib/leads/shared";
import type { PersistedCartItem } from "@/config/types";
import {
  formatPreSalesInquiryTag,
  type PreSalesConsultationValues
} from "@/components/pre-sales/pre-sales-consultation-panel";

export type PreSalesProductContext = {
  slug: string;
  name: string;
  sku?: string;
  image?: string | null;
  productUrl?: string;
};

export type SubmitPreSalesConsultationInput = {
  values: PreSalesConsultationValues;
  cartItems: PersistedCartItem[];
  product: PreSalesProductContext | null;
  isGuest?: boolean;
};

export type SubmitPreSalesConsultationResult =
  | { ok: true; reference: string; leadId: string | null; source: "checkout_enquiry" | "product_enquiry" | "contact_form" }
  | { ok: false; error: string };

function validateValues(values: PreSalesConsultationValues): string | null {
  const name = values.fullName.trim();
  if (!name) return "Name is required.";
  if (name.length < 2 || name.length > 120) return "Name must be between 2 and 120 characters.";
  if (!isValidCustomerEmail(values.email.trim())) return "Enter a valid email address.";
  if (!isValidCustomerPhone(values.phone.trim())) return "Enter a valid phone number (8–15 digits).";
  return null;
}

function taggedMessage(values: PreSalesConsultationValues, fallback: string) {
  const tag = formatPreSalesInquiryTag(values.inquiryType, values.preferredLanguage);
  const notes = values.notes.trim();
  if (!notes) return `${tag} ${fallback}`;
  if (notes.includes("[Inquiry:")) return notes;
  return `${tag} ${notes}`;
}

function readReference(body: Record<string, unknown>, leadNumberFallback?: unknown) {
  const enquiryReference =
    typeof body.enquiryReference === "string" ? body.enquiryReference.trim() : "";
  if (enquiryReference) return enquiryReference;
  const reference = typeof body.reference === "string" ? body.reference.trim() : "";
  if (reference) return reference;
  const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";
  if (typeof leadNumberFallback === "number") return formatLeadReference(leadNumberFallback);
  if (leadId) return leadId;
  return "ENQ";
}

export async function submitPreSalesConsultation(
  input: SubmitPreSalesConsultationInput
): Promise<SubmitPreSalesConsultationResult> {
  const validationError = validateValues(input.values);
  if (validationError) return { ok: false, error: validationError };

  const isGuest = input.isGuest !== false;
  const guestHeaders = isGuest ? await buildGuestRequestHeaders() : null;
  if (isGuest && !guestHeaders?.token) {
    return { ok: false, error: "Something went wrong. Refresh the page and try again." };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(guestHeaders?.headers as Record<string, string> | undefined)
  };

  const fullName = input.values.fullName.trim();
  const email = input.values.email.trim();
  const phone = input.values.phone.trim();

  // Prefer checkout_enquiry when cart has items — matches existing Pre-Sales Consultation.
  if (input.cartItems.length > 0) {
    const idempotencyKey = crypto.randomUUID();
    const response = await fetchWithTimeout("/api/checkout/enquiry", {
      method: "POST",
      headers: {
        ...headers,
        "X-Idempotency-Key": idempotencyKey
      },
      body: JSON.stringify({
        fullName,
        email,
        phone,
        region: "India",
        message: taggedMessage(input.values, "Pre-sales consultation from storefront."),
        items: input.cartItems.map((item) => ({
          productSlug: item.productSlug,
          bundleId: item.bundleId,
          quantity: item.quantity,
          ...(item.variantId ? { variantId: item.variantId } : {}),
          ...(item.productName ? { productName: item.productName } : {})
        }))
      })
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      return {
        ok: false,
        error: typeof body.error === "string" ? body.error : "Could not send enquiry."
      };
    }
    return {
      ok: true,
      source: "checkout_enquiry",
      leadId: typeof body.leadId === "string" ? body.leadId : typeof body.enquiryId === "string" ? body.enquiryId : null,
      reference: readReference(body, body.leadNumber)
    };
  }

  // Product page context → product_enquiry for admin Product badge + product column.
  if (input.product?.slug) {
    const response = await fetchWithTimeout("/api/products/enquiry", {
      method: "POST",
      headers,
      body: JSON.stringify({
        fullName,
        email,
        phone,
        region: "India",
        country: "India",
        productSlug: input.product.slug,
        productName: input.product.name || input.product.slug,
        productSku: input.product.sku || deriveProductSku(input.product.slug),
        preferredContactMethod: "email",
        quantity: 1,
        message: taggedMessage(input.values, `Product enquiry: ${input.product.name || input.product.slug}`),
        image: input.product.image ?? null,
        productUrl: input.product.productUrl ?? `/product/${input.product.slug}`
      })
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      return {
        ok: false,
        error: typeof body.error === "string" ? body.error : "Could not send enquiry."
      };
    }
    return {
      ok: true,
      source: "product_enquiry",
      leadId: typeof body.leadId === "string" ? body.leadId : typeof body.enquiryId === "string" ? body.enquiryId : null,
      reference: readReference(body, body.leadNumber)
    };
  }

  // General browse → contact_form.
  const response = await fetchWithTimeout("/api/contact-requests", {
    method: "POST",
    headers,
    body: JSON.stringify({
      fullName,
      email,
      phone,
      subject: input.values.inquiryType.slice(0, 200),
      message: taggedMessage(input.values, "Pre-sales consultation request."),
      region: "India"
    })
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    return {
      ok: false,
      error: typeof body.error === "string" ? body.error : "Could not send enquiry."
    };
  }
  return {
    ok: true,
    source: "contact_form",
    leadId:
      typeof body.leadId === "string"
        ? body.leadId
        : typeof body.contactRequestId === "string"
          ? body.contactRequestId
          : null,
    reference: readReference(body, body.leadNumber)
  };
}
