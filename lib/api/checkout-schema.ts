import { isValidCustomerEmail, isValidCustomerPhone } from "@/lib/api/customer-contact";
import { cartLineKey } from "@/lib/cart-line-key";

export type GuestAddress = {
  line1: string;
  city: string;
  region: string;
  postalCode: string;
  label?: string;
};

export function isCompleteGuestAddress(address: Partial<GuestAddress> | null | undefined) {
  if (!address) return false;
  const line1 = typeof address.line1 === "string" ? address.line1.trim() : "";
  const city = typeof address.city === "string" ? address.city.trim() : "";
  const region = typeof address.region === "string" ? address.region.trim() : "";
  const postalCode = typeof address.postalCode === "string" ? address.postalCode.trim() : "";
  if (!line1 || !city || !region || !postalCode) return false;
  return ![line1, city, region, postalCode].some((entry) => entry.length > 160);
}

export function isValidCheckoutPhone(phone: string) {
  return isValidCustomerPhone(phone);
}

export function isValidCheckoutEmail(email: string) {
  return isValidCustomerEmail(email);
}

function parseGuestAddressValue(value: unknown): GuestAddress | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const address = value as Record<string, unknown>;
  const line1 = typeof address.line1 === "string" ? address.line1.trim() : "";
  const city = typeof address.city === "string" ? address.city.trim() : "";
  const region = typeof address.region === "string" ? address.region.trim() : "";
  const postalCode = typeof address.postalCode === "string" ? address.postalCode.trim() : "";
  if (!line1 || !city || !region || !postalCode) return null;
  if ([line1, city, region, postalCode].some((entry) => entry.length > 160)) return null;
  const label = typeof address.label === "string" ? address.label.trim().slice(0, 80) : undefined;
  return { line1, city, region, postalCode, ...(label ? { label } : {}) };
}

function parseGuestAddress(record: Record<string, unknown>): GuestAddress | null {
  return parseGuestAddressValue(record.guestAddress);
}

export type CheckoutRequestBody = {
  email: string;
  phone: string;
  fullName: string;
  company?: string;
  items: Array<{ productSlug: string; bundleId: string; variantId?: string; quantity: number }>;
  addressId?: string;
  billingAddressId?: string;
  guestAddress?: GuestAddress;
  guestBillingAddress?: GuestAddress;
  billingSameAsShipping?: boolean;
  region?: string;
  promoCode?: string;
  paymentProvider?: string;
  checkoutFlow?: "buy-now" | "cart";
};

function parseFullName(record: Record<string, unknown>) {
  const fullName = typeof record.fullName === "string" ? record.fullName.trim() : "";
  if (!fullName || fullName.length < 2 || fullName.length > 120) return null;
  return fullName;
}

function parseCompany(record: Record<string, unknown>) {
  const company = typeof record.company === "string" ? record.company.trim() : "";
  if (!company) return undefined;
  if (company.length > 160) return null;
  return company;
}

export function parseCheckoutRequestBody(body: unknown): CheckoutRequestBody | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  const email = typeof record.email === "string" ? record.email.trim() : "";
  if (!isValidCustomerEmail(email)) return null;

  const phone = typeof record.phone === "string" ? record.phone.trim() : "";
  if (!isValidCustomerPhone(phone) || phone.length > 40) return null;

  if (!Array.isArray(record.items) || record.items.length === 0 || record.items.length > 50) {
    return null;
  }

  const items: CheckoutRequestBody["items"] = [];
  const quantityByLine = new Map<string, CheckoutRequestBody["items"][number]>();
  for (const raw of record.items) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const item = raw as Record<string, unknown>;
    const productSlug = typeof item.productSlug === "string" ? item.productSlug.trim() : "";
    const bundleIdRaw = typeof item.bundleId === "string" ? item.bundleId.trim() : "";
    const bundleId = bundleIdRaw || "standard";
    const variantId = typeof item.variantId === "string" ? item.variantId.trim() : undefined;
    const quantity = typeof item.quantity === "number" ? item.quantity : Number(item.quantity);
    if (!productSlug || productSlug.length > 200) return null;
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 99) return null;
    const key = cartLineKey({ productSlug, bundleId, variantId });
    const existing = quantityByLine.get(key);
    if (existing) {
      const nextQuantity = existing.quantity + quantity;
      if (nextQuantity > 99) return null;
      quantityByLine.set(key, { ...existing, quantity: nextQuantity });
      continue;
    }
    quantityByLine.set(key, {
      productSlug,
      bundleId,
      quantity,
      ...(variantId ? { variantId } : {})
    });
  }

  for (const line of quantityByLine.values()) {
    items.push(line);
  }

  const fullName = parseFullName(record);
  if (!fullName) return null;

  const company = parseCompany(record);
  if (company === null) return null;

  const addressId = typeof record.addressId === "string" ? record.addressId.trim() : undefined;
  const billingAddressId = typeof record.billingAddressId === "string" ? record.billingAddressId.trim() : undefined;
  const guestAddress = parseGuestAddress(record);
  const guestBillingAddress = parseGuestAddressValue(record.guestBillingAddress);
  const billingSameAsShipping = record.billingSameAsShipping !== false;
  const region = typeof record.region === "string" ? record.region.trim().slice(0, 120) : undefined;
  const promoCode = typeof record.promoCode === "string" ? record.promoCode.trim().slice(0, 80) : undefined;
  const paymentProvider = typeof record.paymentProvider === "string" ? record.paymentProvider.trim().toLowerCase() : undefined;
  const checkoutFlowRaw = typeof record.checkoutFlow === "string" ? record.checkoutFlow.trim() : "";
  const checkoutFlow = checkoutFlowRaw === "buy-now" ? "buy-now" : checkoutFlowRaw === "cart" ? "cart" : undefined;

  return {
    email,
    phone,
    fullName,
    items,
    ...(company ? { company } : {}),
    ...(addressId ? { addressId } : {}),
    ...(billingAddressId ? { billingAddressId } : {}),
    ...(guestAddress ? { guestAddress } : {}),
    ...(guestBillingAddress ? { guestBillingAddress } : {}),
    billingSameAsShipping,
    ...(region ? { region } : {}),
    ...(promoCode ? { promoCode } : {}),
    ...(paymentProvider ? { paymentProvider } : {}),
    ...(checkoutFlow ? { checkoutFlow } : {})
  };
}

export function validateCheckoutEnquiryRequestBody(body: unknown): { ok: true; data: CheckoutEnquiryRequestBody } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid enquiry request." };
  }
  const record = body as Record<string, unknown>;
  const email = typeof record.email === "string" ? record.email.trim() : "";
  if (!email) return { ok: false, error: "Email is required." };
  if (!isValidCustomerEmail(email)) return { ok: false, error: "Enter a valid email address." };

  const phone = typeof record.phone === "string" ? record.phone.trim() : "";
  if (!phone) return { ok: false, error: "Phone number is required." };
  if (!isValidCustomerPhone(phone) || phone.length > 40) {
    return { ok: false, error: "Enter a valid phone number (8–15 digits)." };
  }

  const fullName = typeof record.fullName === "string" ? record.fullName.trim() : "";
  if (!fullName) return { ok: false, error: "Full name is required." };
  if (fullName.length < 2 || fullName.length > 120) {
    return { ok: false, error: "Full name must be between 2 and 120 characters." };
  }

  const company = typeof record.company === "string" ? record.company.trim() : "";
  if (company.length > 160) return { ok: false, error: "Company name is too long." };

  if (!Array.isArray(record.items) || record.items.length === 0) {
    return { ok: false, error: "Add at least one product to your cart before sending an enquiry." };
  }
  if (record.items.length > 50) {
    return { ok: false, error: "Cart is too large for a single enquiry." };
  }

  const rawMessage = typeof record.message === "string" ? record.message.trim() : "";
  if (rawMessage.length > 5000) return { ok: false, error: "Message is too long." };
  // Guests may submit with contact only; default message keeps admin queue useful.
  const message = rawMessage || "Checkout enquiry from cart.";

  const parsed = parseCheckoutEnquiryRequestBody({ ...record, message });
  if (!parsed) return { ok: false, error: "Check your contact details and cart, then try again." };
  return { ok: true, data: parsed };
}

export type CheckoutEnquiryRequestBody = CheckoutRequestBody & {
  message: string;
};

export function parseCheckoutEnquiryRequestBody(body: unknown): CheckoutEnquiryRequestBody | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  const base = parseCheckoutRequestBody(body);
  if (!base) return null;

  const rawMessage = typeof record.message === "string" ? record.message.trim() : "";
  if (rawMessage.length > 5000) return null;
  const message = rawMessage || "Checkout enquiry from cart.";

  return {
    ...base,
    message
  };
}

export type CheckoutLeadRequestBody = {
  email: string;
  phone: string;
  fullName: string;
  company?: string;
  source: "buy_now" | "checkout";
  items: Array<{ productSlug: string; productName?: string; quantity: number }>;
  region?: string;
};

export function validateCheckoutLeadRequestBody(
  body: unknown
): { ok: true; data: CheckoutLeadRequestBody } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid lead request." };
  }
  const record = body as Record<string, unknown>;

  const email = typeof record.email === "string" ? record.email.trim() : "";
  if (!email) return { ok: false, error: "Email is required." };
  if (!isValidCustomerEmail(email)) return { ok: false, error: "Enter a valid email address." };

  const phone = typeof record.phone === "string" ? record.phone.trim() : "";
  if (!phone) return { ok: false, error: "Phone number is required." };
  if (!isValidCustomerPhone(phone) || phone.length > 40) {
    return { ok: false, error: "Enter a valid phone number (8–15 digits)." };
  }

  const fullName = typeof record.fullName === "string" ? record.fullName.trim() : "";
  if (!fullName) return { ok: false, error: "Full name is required." };
  if (fullName.length < 2 || fullName.length > 120) {
    return { ok: false, error: "Full name must be between 2 and 120 characters." };
  }

  const company = typeof record.company === "string" ? record.company.trim() : "";
  if (company.length > 160) return { ok: false, error: "Company name is too long." };

  const sourceRaw = typeof record.source === "string" ? record.source.trim().toLowerCase() : "";
  const source = sourceRaw === "buy_now" || sourceRaw === "buy-now"
    ? "buy_now"
    : sourceRaw === "checkout"
      ? "checkout"
      : null;
  if (!source) return { ok: false, error: "Lead source is required." };

  if (!Array.isArray(record.items) || record.items.length === 0) {
    return { ok: false, error: "Add at least one product before continuing." };
  }
  if (record.items.length > 50) {
    return { ok: false, error: "Cart is too large for a single lead." };
  }

  const items: CheckoutLeadRequestBody["items"] = [];
  for (const raw of record.items) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error: "Check your cart details and try again." };
    }
    const item = raw as Record<string, unknown>;
    const productSlug = typeof item.productSlug === "string" ? item.productSlug.trim() : "";
    const productName = typeof item.productName === "string" ? item.productName.trim() : undefined;
    const quantity = typeof item.quantity === "number" ? item.quantity : Number(item.quantity);
    if (!productSlug || productSlug.length > 200) {
      return { ok: false, error: "Check your cart details and try again." };
    }
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 99) {
      return { ok: false, error: "Check your cart details and try again." };
    }
    items.push({
      productSlug,
      quantity,
      ...(productName ? { productName: productName.slice(0, 200) } : {})
    });
  }

  const region = typeof record.region === "string" ? record.region.trim().slice(0, 120) : undefined;

  return {
    ok: true,
    data: {
      email,
      phone,
      fullName,
      ...(company ? { company } : {}),
      source,
      items,
      ...(region ? { region } : {})
    }
  };
}
