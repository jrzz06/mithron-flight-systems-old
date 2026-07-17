"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { isValidCheckoutEmail, isValidCheckoutPhone, isCompleteGuestAddress } from "@/lib/api/checkout-schema";
import {
  CUSTOMER_CONTACT_REQUIRED_MESSAGE,
  DEFAULT_PHONE_COUNTRY_CODE,
  composeE164,
  getPhoneCountry,
  splitE164ToCountry,
  validatePhoneWithCountry
} from "@/lib/api/customer-contact";
import { PhoneCountryField } from "@/components/auth/phone-country-field";
import { buildGuestRequestHeaders } from "@/lib/api/client-audit-token-client";
import {
  clearPendingPaymentVerification,
  readPendingPaymentVerification,
  savePendingPaymentVerification
} from "@/lib/checkout/pending-payment";
import {
  buildRazorpayCheckoutClientConfig,
  isRazorpayQrEligibleViewport,
  logRazorpayClientEvent,
  normalizeRazorpayContact
} from "@/lib/payments/razorpay-checkout";
import { ensureCashfreeCheckoutScript, ensureRazorpayCheckoutScript } from "@/lib/checkout/deferred-payment-sdk";
import { isStorefrontGuestOnly } from "@/lib/storefront/guest-demo";
import { Button } from "@/components/ui/button";
import { CheckoutOrderSummary } from "@/components/checkout/checkout-order-summary";
import { CheckoutPaymentStepLazy } from "./checkout-payment-step";
import { inrToPaise } from "@/services/payments/amount";
import { cn, formatINR } from "@/lib/utils";
import { useCheckoutFlow } from "@/hooks/use-checkout-flow";
import { notify } from "@/lib/feedback/notify";
import { FEEDBACK_MESSAGES } from "@/lib/feedback/messages";
import { createClient } from "@/lib/client";
import { useResolvedCart } from "@/hooks/use-resolved-cart";
import { useBuyNowHasHydrated, useBuyNowStore } from "@/store/buy-now-session";
import { useCartSessionReady, useCartStore } from "@/store/cart";
import { fetchWithTimeout, raceWithTimeout } from "@/lib/fetch-with-timeout";
import styles from "./checkout.module.css";

function readCheckoutErrorMessage(response: Response, payload: Record<string, unknown>) {
  if (typeof payload.error === "string" && payload.error.trim()) {
    return payload.error.trim();
  }
  if (response.status === 401) return "Please sign in again and try again.";
  if (response.status === 409) return "One or more items are unavailable.";
  if (response.status === 503) return "Payment service is temporarily unavailable.";
  if (response.status === 429) return "Too many attempts. Wait a moment and try again.";
  return `Checkout failed (${response.status}). Please try again.`;
}

type AddressRow = {
  id: string;
  label?: string;
  line1?: string;
  city?: string;
  region?: string;
  postal_code?: string;
  phone?: string | null;
  is_default?: boolean;
  is_billing?: boolean;
  is_shipping?: boolean;
};

type GuestAddressForm = {
  label: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
};

type CompletionMode = "payment" | "enquiry";

type CompletionState = {
  mode: CompletionMode;
  orderId: string;
  orderNumber: string;
  email: string;
  phone: string;
  fullName: string;
  total: number;
  isSignedIn: boolean;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (response: Record<string, unknown>) => void) => void;
    };
    Cashfree?: (config: { mode: "sandbox" | "production" }) => {
      checkout: (options: { paymentSessionId: string; redirectTarget?: string }) => Promise<{ error?: unknown }>;
    };
  }
}

const emptyGuestAddress = (): GuestAddressForm => ({
  label: "Home",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: ""
});


async function completeStubPayment(intentId: string, amount: number) {
  const response = await fetchWithTimeout("/api/payments/webhooks/stub", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      intentId,
      amount,
      currency: "INR",
      paymentId: `stub_pay_${Date.now()}`
    })
  });
  return response.ok;
}

function CheckoutInvoice({
  completed,
  items
}: {
  completed: CompletionState;
  items: Array<{ productName: string; bundleName: string; quantity: number; unitPrice: number }>;
}) {
  const issuedAt = new Date().toLocaleString();

  return (
    <div className={styles.invoiceCard}>
      <div className={styles.invoiceHeader}>
        <div>
          <p className={styles.invoiceLabel}>Tax invoice</p>
          <p className={styles.invoiceNumber}>{completed.orderNumber}</p>
        </div>
        <div className={styles.invoiceMeta}>
          <p>{issuedAt}</p>
          <p>{completed.mode === "payment" ? "Payment received" : "Enquiry submitted"}</p>
        </div>
      </div>

      <div className={styles.invoiceContact}>
        <p><strong>Name:</strong> {completed.fullName || "—"}</p>
        <p><strong>Email:</strong> {completed.email}</p>
        <p><strong>Phone:</strong> {completed.phone}</p>
      </div>

      <div className={styles.invoiceItems}>
        {items.map((item) => (
          <div key={`${item.productName}-${item.bundleName}`} className={styles.invoiceItem}>
            <div>
              <p className={styles.invoiceItemName}>{item.productName}</p>
              <p className={styles.invoiceItemMeta}>{item.bundleName} × {item.quantity}</p>
            </div>
            <p className={styles.invoiceItemName}>{formatINR(item.unitPrice * item.quantity)}</p>
          </div>
        ))}
      </div>

      <div className={styles.invoiceTotal}>
        <span>Total payable</span>
        <span>{formatINR(completed.total)}</span>
      </div>

      <p className={styles.invoiceFootnote}>
        {completed.mode === "payment"
          ? "Your payment has been received. Our team will verify the order and share dispatch updates by email and phone."
          : "Your enquiry has been received. Our team will contact you using the details above."}
      </p>
    </div>
  );
}

export function CheckoutPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { flow, isBuyNowFlow, checkoutItems, isBuyNowSessionMissing } = useCheckoutFlow();
  const checkout = useCartStore((state) => state.checkout);
  const setCheckoutEmail = useCartStore((state) => state.setCheckoutEmail);
  const setCheckoutContact = useCartStore((state) => state.setCheckoutContact);
  const setShippingAddressId = useCartStore((state) => state.setShippingAddressId);
  const setBillingAddressId = useCartStore((state) => state.setBillingAddressId);
  const setCheckoutOrderMeta = useCartStore((state) => state.setCheckoutOrderMeta);
  const clearCart = useCartStore((state) => state.clearCart);
  const clearBuyNow = useBuyNowStore((state) => state.clearBuyNow);
  const buyNowHasHydrated = useBuyNowHasHydrated();
  const isCartSessionReady = useCartSessionReady();
  const {

    items,
    grandTotal,
    pricingChanged,
    refreshPricing,
    clearPricingChanged,
    isResolving
  } = useResolvedCart({ enabled: isCartSessionReady, itemsOverride: checkoutItems });

  const [addresses, setAddresses] = useState<AddressRow[]>([]);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [guestAddress, setGuestAddress] = useState<GuestAddressForm>(emptyGuestAddress);
  const [guestBillingAddress, setGuestBillingAddress] = useState<GuestAddressForm>(() => ({
    ...emptyGuestAddress(),
    label: "Billing"
  }));
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);
  const [showNewAddressForm, setShowNewAddressForm] = useState(false);
  const [showManualBillingForm, setShowManualBillingForm] = useState(false);
  const [showEnquiry, setShowEnquiry] = useState(true);
  const contactTouchedRef = useRef({ fullName: false, phone: false, email: false });
  const [contactDraftReady, setContactDraftReady] = useState(false);
  const checkoutNextPath = `/checkout?flow=${flow}`;
  const loginNextHref = `/login?next=${encodeURIComponent(checkoutNextPath)}`;
  const signupNextHref = `/login?mode=signup&next=${encodeURIComponent(checkoutNextPath)}`;

  const billingAddressId = checkout.billingAddressId ?? "";
  const [loading, setLoading] = useState<"payment" | "enquiry" | "stub" | null>(null);
  const [error, setError] = useState("");
  const reportCheckoutError = useCallback((message: string, id?: string) => {
    setError(message);
    if (message.trim()) {
      notify.error(message, {
        source: "checkout",
        id: id ?? `checkout:${message.slice(0, 48)}`
      });
    }
  }, []);
  const [enquiryMessage, setEnquiryMessage] = useState("");
  const [phoneCountryCode, setPhoneCountryCode] = useState(DEFAULT_PHONE_COUNTRY_CODE);
  const [phoneNational, setPhoneNational] = useState("");
  const phone = useMemo(() => {
    const result = validatePhoneWithCountry(phoneCountryCode, phoneNational);
    return result.ok ? result.value : composeE164(getPhoneCountry(phoneCountryCode).dial, phoneNational);
  }, [phoneCountryCode, phoneNational]);
  const [fullName, setFullName] = useState("");
  const [completed, setCompleted] = useState<CompletionState | null>(null);
  const [paymentProviders, setPaymentProviders] = useState<string[]>([]);
  const [paymentProvider, setPaymentProvider] = useState("");
  const checkoutIdempotencyKeyRef = useRef<string | null>(null);
  const checkoutEnquiryIdempotencyKeyRef = useRef<string | null>(null);
  const checkoutLeadIdempotencyKeyRef = useRef<string | null>(null);
  const checkoutActionRequestIdRef = useRef(0);
  const verifyingPaymentRef = useRef(false);
  const checkoutOpeningRef = useRef(false);
  const checkoutPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [gatewayModalOpen, setGatewayModalOpen] = useState(false);

  // Restore contact draft from cart persistence (guest or post-login merge).
  useEffect(() => {
    if (!isCartSessionReady || contactDraftReady) return;
    const draftName = checkout.fullName?.trim() ?? "";
    const draftPhone = checkout.phone?.trim() ?? "";
    if (draftName) setFullName(draftName);
    if (draftPhone) {
      const split = splitE164ToCountry(draftPhone);
      setPhoneCountryCode(split.countryCode);
      setPhoneNational(split.national);
    }
    setContactDraftReady(true);
  }, [checkout.fullName, checkout.phone, contactDraftReady, isCartSessionReady]);

  // Persist name / phone so login returns with the same contact draft.
  useEffect(() => {
    if (!isCartSessionReady || !contactDraftReady) return;
    setCheckoutContact({
      fullName: fullName.trim(),
      phone: phone.trim()
    });
  }, [contactDraftReady, fullName, isCartSessionReady, phone, setCheckoutContact]);

  const buildPaymentSuccessUrl = useCallback((orderId: string, signedIn: boolean) => {
    const params = new URLSearchParams({ orderId });
    if (!signedIn) params.set("email", checkout.email.trim());
    return `/checkout/success?${params.toString()}`;
  }, [checkout.email]);

  const getCheckoutIdempotencyKey = useCallback(() => {
    if (!checkoutIdempotencyKeyRef.current) {
      checkoutIdempotencyKeyRef.current = crypto.randomUUID();
    }
    return checkoutIdempotencyKeyRef.current;
  }, []);

  const rotateCheckoutIdempotencyKey = useCallback(() => {
    checkoutIdempotencyKeyRef.current = crypto.randomUUID();
  }, []);

  const getCheckoutEnquiryIdempotencyKey = useCallback(() => {
    if (!checkoutEnquiryIdempotencyKeyRef.current) {
      checkoutEnquiryIdempotencyKeyRef.current = crypto.randomUUID();
    }
    return checkoutEnquiryIdempotencyKeyRef.current;
  }, []);

  const getCheckoutLeadIdempotencyKey = useCallback(() => {
    if (!checkoutLeadIdempotencyKeyRef.current) {
      checkoutLeadIdempotencyKeyRef.current = crypto.randomUUID();
    }
    return checkoutLeadIdempotencyKeyRef.current;
  }, []);

  const saveCheckoutLead = useCallback(async () => {
    const guestHeaders = isSignedIn ? null : await buildGuestRequestHeaders();
    if (!isSignedIn && !guestHeaders?.token) {
      return { ok: false as const, error: "Something went wrong. Refresh the page and try again." };
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Idempotency-Key": getCheckoutLeadIdempotencyKey(),
      ...(isSignedIn ? {} : (guestHeaders!.headers as Record<string, string>))
    };

    const response = await fetchWithTimeout("/api/checkout/lead", {
      method: "POST",
      headers,
      body: JSON.stringify({
        email: checkout.email.trim(),
        phone: phone.trim(),
        fullName: fullName.trim(),
        region: checkout.region,
        source: isBuyNowFlow ? "buy_now" : "checkout",
        items: checkoutItems.map((item) => ({
          productSlug: item.productSlug,
          productName: item.productName,
          quantity: item.quantity
        }))
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false as const,
        error: typeof payload.error === "string" ? payload.error : "Could not save your contact details."
      };
    }
    return { ok: true as const };
  }, [
    checkout.email,
    checkout.region,
    checkoutItems,
    fullName,
    getCheckoutLeadIdempotencyKey,
    isBuyNowFlow,
    isSignedIn,
    phone
  ]);

  const stopCheckoutStatusPolling = useCallback(() => {
    if (checkoutPollRef.current) {
      clearInterval(checkoutPollRef.current);
      checkoutPollRef.current = null;
    }
  }, []);

  const waitForCheckoutPaymentConfirmation = useCallback(async (input: {
    orderId: string;
    email: string;
    signedIn: boolean;
  }) => {
    const guestHeaders = input.signedIn ? null : await buildGuestRequestHeaders();
    if (!input.signedIn && !guestHeaders?.token) return false;

    const query = new URLSearchParams({
      orderId: input.orderId,
      ...(input.signedIn ? {} : { email: input.email })
    });

    for (let attempt = 0; attempt < 15; attempt += 1) {
      const response = await fetchWithTimeout(`/api/checkout/status?${query.toString()}`, {
        headers: input.signedIn ? undefined : (guestHeaders!.headers as Record<string, string>),
        cache: "no-store"
      });
      if (response.ok) {
        const payload = await response.json().catch(() => ({}));
        if (payload.paid) return true;
        if (payload.paymentStatus === "failed" || payload.orderPaymentStatus === "failed") return false;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    return false;
  }, []);

  const verifyPaymentOnServer = useCallback(async (input: {
    orderId: string;
    provider: string;
    email: string;
    signedIn: boolean;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    razorpaySignature?: string;
    cashfreeOrderId?: string;
  }): Promise<{ paid: boolean; orderNumber?: string; error?: string }> => {
    const guestHeaders = input.signedIn ? null : await buildGuestRequestHeaders();
    if (!input.signedIn && !guestHeaders?.token) {
      return { paid: false, error: "Something went wrong. Refresh the page and try again." };
    }

    const response = await fetchWithTimeout("/api/payments/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(input.signedIn ? {} : (guestHeaders!.headers as Record<string, string>))
      },
      body: JSON.stringify({
        orderId: input.orderId,
        provider: input.provider,
        email: input.email,
        razorpayOrderId: input.razorpayOrderId,
        razorpayPaymentId: input.razorpayPaymentId,
        razorpaySignature: input.razorpaySignature,
        cashfreeOrderId: input.cashfreeOrderId
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        paid: false,
        error: typeof payload.error === "string" ? payload.error : "We couldn't confirm your payment."
      };
    }
    if (payload.paid) {
      clearPendingPaymentVerification();
      return {
        paid: true,
        orderNumber: typeof payload.orderNumber === "string" ? payload.orderNumber : undefined
      };
    }

    if (typeof payload.error === "string" && payload.error.trim()) {
      return { paid: false, error: payload.error.trim() };
    }

    const confirmed = await waitForCheckoutPaymentConfirmation({
      orderId: input.orderId,
      email: input.email,
      signedIn: input.signedIn
    });
    if (confirmed) {
      clearPendingPaymentVerification();
      return { paid: true };
    }

    return {
      paid: false,
      error: "Payment is still being confirmed on our server. Keep this page open or check your email shortly."
    };
  }, [waitForCheckoutPaymentConfirmation]);

  const stubOrderId = searchParams.get("order");
  const stubFlag = searchParams.get("stub");

  const shippingAddresses = useMemo(
    () => addresses.filter((address) => address.is_shipping !== false),
    [addresses]
  );
  const billingAddresses = useMemo(
    () => addresses.filter((address) => address.is_billing !== false),
    [addresses]
  );

  const usingSavedAddress = Boolean(
    isSignedIn && checkout.shippingAddressId && shippingAddresses.length && !showNewAddressForm
  );
  const usingSavedBillingAddress = Boolean(
    isSignedIn
      && !billingSameAsShipping
      && billingAddressId
      && billingAddresses.length
      && !showManualBillingForm
  );

  const cartPayload = useMemo(() => {
    const payload: Record<string, unknown> = {
      email: checkout.email,
      phone: phone.trim(),
      fullName: fullName.trim(),
      region: checkout.region,
      items: checkoutItems.map((item) => ({
        productSlug: item.productSlug,
        bundleId: item.bundleId,
        quantity: item.quantity,
        ...(item.variantId ? { variantId: item.variantId } : {})
      })),
      checkoutFlow: flow
    };

    const promoCode = checkout.promoCode.trim();
    if (promoCode) payload.promoCode = promoCode;
    if (paymentProvider) payload.paymentProvider = paymentProvider;

    if (usingSavedAddress) {
      payload.addressId = checkout.shippingAddressId;
    } else {
      const streetLine = [guestAddress.line2.trim(), guestAddress.line1.trim()].filter(Boolean).join(", ");
      const trimmed = {
        label: guestAddress.label.trim() || "Home",
        line1: streetLine,
        city: guestAddress.city.trim(),
        region: guestAddress.region.trim(),
        postalCode: guestAddress.postalCode.trim()
      };
      if (trimmed.line1 && trimmed.city && trimmed.region && trimmed.postalCode) {
        payload.guestAddress = trimmed;
      }
    }

    payload.billingSameAsShipping = billingSameAsShipping;
    if (!billingSameAsShipping) {
      if (usingSavedBillingAddress) {
        payload.billingAddressId = billingAddressId;
      } else {
        const trimmedBilling = {
          label: guestBillingAddress.label.trim() || "Billing",
          line1: guestBillingAddress.line1.trim(),
          city: guestBillingAddress.city.trim(),
          region: guestBillingAddress.region.trim(),
          postalCode: guestBillingAddress.postalCode.trim()
        };
        if (
          trimmedBilling.line1
          && trimmedBilling.city
          && trimmedBilling.region
          && trimmedBilling.postalCode
        ) {
          payload.guestBillingAddress = trimmedBilling;
        }
      }
    }

    return payload;
  }, [
    checkout.email,
    checkout.region,
    checkout.shippingAddressId,
    checkout.promoCode,
    phone,
    fullName,
    checkoutItems,
    flow,
    usingSavedAddress,
    usingSavedBillingAddress,
    guestAddress,
    guestBillingAddress,
    billingSameAsShipping,
    billingAddressId,
    paymentProvider
  ]);

  const markComplete = useCallback((
    mode: CompletionMode,
    orderId: string,
    orderNumber: string,
    total = grandTotal
  ) => {
    if (isBuyNowFlow) {
      clearBuyNow();
    } else {
      clearCart();
    }
    setCheckoutOrderMeta({ orderId });
    setCompleted({
      mode,
      orderId,
      orderNumber,
      email: checkout.email.trim(),
      phone: phone.trim(),
      fullName: fullName.trim(),
      total,
      isSignedIn
    });
    reportCheckoutError("");
    if (mode === "payment") {
      notify.success(FEEDBACK_MESSAGES.checkoutSuccess, { source: "checkout", id: `order:complete:${orderId}` });
      notify.success(FEEDBACK_MESSAGES.paymentSuccess, { source: "checkout", id: `pay:complete:${orderId}` });
    } else {
      notify.success(FEEDBACK_MESSAGES.productEnquirySent, { source: "checkout", id: `enquiry:complete:${orderId}` });
    }
  }, [reportCheckoutError, setCheckoutOrderMeta, checkout.email, phone, fullName, grandTotal, isSignedIn, clearCart, clearBuyNow, isBuyNowFlow]);

  useEffect(() => {
    if (!isCartSessionReady) return;
    if (isBuyNowFlow && !buyNowHasHydrated) return;
    if (isBuyNowSessionMissing) {
      router.replace("/");
      return;
    }
    if (!isBuyNowFlow && !checkoutItems.length) {
      router.replace("/cart");
    }
  }, [buyNowHasHydrated, checkoutItems.length, isBuyNowFlow, isBuyNowSessionMissing, isCartSessionReady, router]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    fetch("/api/account/addresses", { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) {
          if (active) {
            setIsSignedIn(false);
            setAddresses([]);
          }
          return { addresses: [] };
        }
        if (active) setIsSignedIn(true);
        return response.ok ? response.json() : { addresses: [] };
      })
      .then((payload) => {
        if (!active) return;
        const rows = Array.isArray(payload.addresses) ? payload.addresses : [];
        setAddresses(rows);
        const defaultShipping = rows.find((row: AddressRow) => row.is_shipping !== false && row.is_default)
          ?? rows.find((row: AddressRow) => row.is_shipping !== false);
        if (defaultShipping && !checkout.shippingAddressId) {
          setShippingAddressId(defaultShipping.id);
        }
        const defaultBilling = rows.find((row: AddressRow) => row.is_billing !== false && row.is_default)
          ?? rows.find((row: AddressRow) => row.is_billing !== false);
        if (defaultBilling && !checkout.billingAddressId) {
          setBillingAddressId(defaultBilling.id);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
      controller.abort();
    };
  }, [checkout.shippingAddressId, checkout.billingAddressId, setShippingAddressId, setBillingAddressId]);

  useEffect(() => {
    if (!isSignedIn) return;

    void createClient()
      .auth.getUser()
      .then(({ data }) => {
        const user = data.user;
        if (!user) return;

        if (user.email && !contactTouchedRef.current.email && !checkout.email.trim()) {
          setCheckoutEmail(user.email);
        }

        const metadataName =
          typeof user.user_metadata?.full_name === "string"
            ? user.user_metadata.full_name
            : typeof user.user_metadata?.name === "string"
              ? user.user_metadata.name
              : "";
        if (metadataName && !contactTouchedRef.current.fullName && !fullName.trim()) {
          setFullName(metadataName);
        }
      })
      .catch(() => undefined);
  }, [checkout.email, fullName, isSignedIn, setCheckoutEmail]);

  useEffect(() => {
    if (!isSignedIn || contactTouchedRef.current.phone || phoneNational.trim()) return;
    const selected =
      shippingAddresses.find((entry) => entry.id === checkout.shippingAddressId)
      ?? shippingAddresses.find((entry) => entry.is_default)
      ?? shippingAddresses[0];
    const addressPhone = selected?.phone;
    if (typeof addressPhone === "string" && addressPhone.trim()) {
      const frameId = requestAnimationFrame(() => {
        const split = splitE164ToCountry(addressPhone.trim());
        setPhoneCountryCode(split.countryCode);
        setPhoneNational(split.national);
      });
      return () => cancelAnimationFrame(frameId);
    }
    return;
  }, [checkout.shippingAddressId, isSignedIn, phoneNational, shippingAddresses]);

  useEffect(() => {
    if (billingSameAsShipping && checkout.shippingAddressId) {
      setBillingAddressId(checkout.shippingAddressId);
    }
  }, [billingSameAsShipping, checkout.shippingAddressId, setBillingAddressId]);

  useEffect(() => {
    if (
      !billingSameAsShipping
      && isSignedIn
      && billingAddresses.length
      && !billingAddressId
      && !showManualBillingForm
    ) {
      const defaultBilling = billingAddresses.find((address) => address.is_default) ?? billingAddresses[0];
      if (defaultBilling) {
        setBillingAddressId(defaultBilling.id);
      }
    }
  }, [
    billingSameAsShipping,
    isSignedIn,
    billingAddresses,
    billingAddressId,
    showManualBillingForm,
    setBillingAddressId
  ]);

  useEffect(() => {
    let active = true;
    fetch("/api/payments/providers", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : { providers: [] }))
      .then((payload) => {
        if (!active) return;
        const providers = Array.isArray(payload.providers) ? payload.providers.filter((value: unknown) => typeof value === "string") : [];
        setPaymentProviders(providers);
        setPaymentProvider((current) => current || providers[0] || "");
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => () => {
    stopCheckoutStatusPolling();
  }, [stopCheckoutStatusPolling]);

  useEffect(() => {
    if (!stubOrderId || stubFlag !== "1" || completed) return;

    let active = true;

    (async () => {
      setLoading("stub");
      try {
        const intentId = checkout.paymentIntentId ?? `stub_intent_${stubOrderId}`;
        const ok = await completeStubPayment(intentId, grandTotal);
        if (!active) return;
        if (ok) {
          markComplete("payment", stubOrderId, stubOrderId);
          router.replace("/checkout", { scroll: false });
        } else {
          reportCheckoutError("Payment could not be confirmed. Please try again.");
        }
      } catch {
        if (!active) return;
        reportCheckoutError("Payment could not be confirmed. Please try again.");
      } finally {
        if (active) setLoading(null);
      }
    })();

    return () => {
      active = false;
    };
  }, [stubOrderId, stubFlag, completed, checkout.paymentIntentId, grandTotal, markComplete, reportCheckoutError, router]);

  const cashfreeReturnOrderId = searchParams.get("order");
  const cashfreeReturnFlag = searchParams.get("cashfree_return");

  useEffect(() => {
    if (!cashfreeReturnOrderId || cashfreeReturnFlag !== "1" || completed) return;

    let active = true;
    (async () => {
      setLoading("payment");
      try {
        const verification = await raceWithTimeout(verifyPaymentOnServer({
          orderId: cashfreeReturnOrderId,
          provider: "cashfree",
          email: checkout.email,
          signedIn: isSignedIn,
          cashfreeOrderId: checkout.paymentIntentId ?? undefined
        }), undefined, "Cashfree payment verification");
        if (!active) return;
        if (verification.paid) {
          markComplete("payment", cashfreeReturnOrderId, cashfreeReturnOrderId);
          router.replace("/checkout", { scroll: false });
        } else {
          reportCheckoutError(verification.error ?? "Payment could not be confirmed yet. Please wait a moment and refresh.");
        }
      } catch {
        if (!active) return;
        reportCheckoutError("Payment could not be confirmed yet. Please wait a moment and refresh.");
      } finally {
        if (active) setLoading(null);
      }
    })();

    return () => {
      active = false;
    };
  }, [cashfreeReturnOrderId, cashfreeReturnFlag, completed, checkout.email, checkout.paymentIntentId, isSignedIn, markComplete, reportCheckoutError, router, verifyPaymentOnServer]);

  useEffect(() => {
    const pending = readPendingPaymentVerification();
    if (!pending || completed || loading) return;

    let active = true;
    (async () => {
      setLoading("payment");
      try {
        const guestHeaders = pending.signedIn ? null : await buildGuestRequestHeaders();
        if (!pending.signedIn && !guestHeaders?.token) {
          reportCheckoutError("Something went wrong. Refresh the page and try again.", "pending:guest-token");
          return;
        }

        const response = await fetchWithTimeout("/api/payments/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(pending.signedIn ? {} : (guestHeaders!.headers as Record<string, string>))
          },
          body: JSON.stringify({
            orderId: pending.orderId,
            provider: "razorpay",
            email: pending.email,
            razorpayOrderId: pending.razorpayOrderId,
            razorpayPaymentId: pending.razorpayPaymentId,
            razorpaySignature: pending.razorpaySignature
          })
        });
        const payload = await response.json().catch(() => ({}));
        if (!active) return;

        if (response.ok && payload.paid) {
          clearPendingPaymentVerification();
          router.replace(buildPaymentSuccessUrl(pending.orderId, pending.signedIn));
          return;
        }

        const message = typeof payload.error === "string" && payload.error.trim()
          ? payload.error.trim()
          : "Payment could not be confirmed. Please try again.";
        reportCheckoutError(message, "pending:verify-failed");
      } catch {
        if (active) reportCheckoutError("Payment could not be confirmed. Please try again.", "pending:verify-failed");
      } finally {
        if (active) setLoading(null);
      }
    })();

    return () => {
      active = false;
    };
  }, [buildPaymentSuccessUrl, completed, loading, reportCheckoutError, router]);

  function validateBase(requireAddress: boolean) {
    if (!checkoutItems.length) {
      reportCheckoutError(isBuyNowFlow ? "Your Buy Now request expired." : "Your cart is empty.");
      return false;
    }
    if (!fullName.trim()) {
      reportCheckoutError("Full name is required.");
      return false;
    }
    if (fullName.trim().length < 2) {
      reportCheckoutError("Enter your full name.");
      return false;
    }
    if (!checkout.email.trim()) {
      reportCheckoutError("Email is required.");
      return false;
    }
    if (!isValidCheckoutEmail(checkout.email.trim())) {
      reportCheckoutError("Enter a valid email address.");
      return false;
    }
    if (!phoneNational.trim()) {
      reportCheckoutError("Phone number is required.");
      return false;
    }
    const phoneResult = validatePhoneWithCountry(phoneCountryCode, phoneNational);
    if (!phoneResult.ok) {
      reportCheckoutError(phoneResult.error);
      return false;
    }
    if (!isValidCheckoutPhone(phoneResult.value)) {
      reportCheckoutError("Enter a valid phone number (8–15 digits).");
      return false;
    }
    if (requireAddress) {
      if (usingSavedAddress) {
        if (!billingSameAsShipping && !usingSavedBillingAddress && !isCompleteGuestAddress(guestBillingAddress)) {
          reportCheckoutError("Enter a complete billing address.");
          return false;
        }
        return true;
      }
      if (!guestAddress.line1.trim() || !guestAddress.city.trim() || !guestAddress.region.trim() || !guestAddress.postalCode.trim()) {
        reportCheckoutError("Enter a complete shipping address to pay online.");
        return false;
      }
      if (!billingSameAsShipping && !isCompleteGuestAddress(guestBillingAddress)) {
        reportCheckoutError("Enter a complete billing address.");
        return false;
      }
    }
    return true;
  }

  async function openRazorpayCheckout(input: {
    key: string;
    orderId: string;
    orderNumber: string;
    razorpayOrderId: string;
    amountPaise: number;
    email: string;
    signedIn: boolean;
    keyMode?: string | null;
    useDashboardConfig?: boolean;
  }) {
    if (checkoutOpeningRef.current) {
      logRazorpayClientEvent("checkout_open_blocked", { reason: "already_open" }, "warn");
      return false;
    }

    const loaded = await ensureRazorpayCheckoutScript();
    if (!loaded || !window.Razorpay) {
      logRazorpayClientEvent("checkout_script_unavailable", {}, "error");
      reportCheckoutError("Payment gateway failed to load. Please refresh and try again.");
      return false;
    }

    if (!input.amountPaise || input.amountPaise < 100) {
      reportCheckoutError("Order total must be at least ₹1 to pay online.");
      return false;
    }

    checkoutOpeningRef.current = true;
    setGatewayModalOpen(true);

    logRazorpayClientEvent("checkout_init", {
      orderId: input.orderId,
      razorpayOrderId: input.razorpayOrderId,
      amountPaise: input.amountPaise,
      keyMode: input.keyMode ?? "unknown",
      viewportWidth: typeof window !== "undefined" ? window.innerWidth : null,
      qrEligible: isRazorpayQrEligibleViewport(),
      useDashboardConfig: Boolean(input.useDashboardConfig)
    });

    const contact = normalizeRazorpayContact(phone.trim());
    const displayConfig = buildRazorpayCheckoutClientConfig(Boolean(input.useDashboardConfig));

    return new Promise<boolean>((resolve) => {
      const finishCheckout = (paid: boolean) => {
        stopCheckoutStatusPolling();
        checkoutOpeningRef.current = false;
        setGatewayModalOpen(false);
        if (!paid) {
          rotateCheckoutIdempotencyKey();
        }
        resolve(paid);
      };

      const handleRazorpaySuccess = async (response: {
        razorpay_order_id?: string;
        razorpay_payment_id?: string;
        razorpay_signature?: string;
      }) => {
        if (verifyingPaymentRef.current) return;
        verifyingPaymentRef.current = true;

        const razorpayOrderId = response.razorpay_order_id ?? input.razorpayOrderId;
        const razorpayPaymentId = response.razorpay_payment_id ?? "";
        const razorpaySignature = response.razorpay_signature ?? "";

        logRazorpayClientEvent("payment_handler", {
          orderId: input.orderId,
          razorpayOrderId,
          razorpayPaymentId: razorpayPaymentId || null
        });

        savePendingPaymentVerification({
          orderId: input.orderId,
          orderNumber: input.orderNumber,
          provider: "razorpay",
          email: input.email,
          signedIn: input.signedIn,
          razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature
        });

        setLoading("payment");
        try {
          const verification = await verifyPaymentOnServer({
            orderId: input.orderId,
            provider: "razorpay",
            email: input.email,
            signedIn: input.signedIn,
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature
          });
          setLoading(null);
          if (verification.paid) {
            router.push(buildPaymentSuccessUrl(input.orderId, input.signedIn));
            finishCheckout(true);
            return;
          }
          reportCheckoutError(
            verification.error
            ?? "We're still confirming your payment. Keep this page open while we retry."
          );
          finishCheckout(false);
        } finally {
          setLoading(null);
          verifyingPaymentRef.current = false;
        }
      };

      const rzpOptions: Record<string, unknown> = {
        key: input.key,
        name: "Mithron",
        description: `Order ${input.orderNumber}`,
        order_id: input.razorpayOrderId,
        currency: "INR",
        prefill: { email: input.email, contact },
        theme: { color: "#174d33", backdrop_color: "#f7faf8" },
        retry: { enabled: true, max_count: 3 },
        handler: handleRazorpaySuccess,
        modal: {
          confirm_close: true,
          ondismiss: () => {
            logRazorpayClientEvent("checkout_dismissed", { orderId: input.orderId });
            reportCheckoutError("Payment window closed. You have not been charged.");
            finishCheckout(false);
          }
        }
      };

      if (displayConfig) {
        rzpOptions.config = displayConfig;
      }

      const rzp = new window.Razorpay!(rzpOptions);

      rzp.on("payment.success", (response) => {
        logRazorpayClientEvent("payment_success_event", { orderId: input.orderId });
        void handleRazorpaySuccess(response as {
          razorpay_order_id?: string;
          razorpay_payment_id?: string;
          razorpay_signature?: string;
        });
      });

      rzp.on("payment.failed", (response) => {
        const reason = typeof response.error === "object" && response.error && "description" in response.error
          ? String((response.error as { description?: string }).description ?? "")
          : "";
        const code = typeof response.error === "object" && response.error && "code" in response.error
          ? String((response.error as { code?: string }).code ?? "")
          : "";
        logRazorpayClientEvent("payment_failed", {
          orderId: input.orderId,
          code: code || null,
          reason: reason || null
        }, "warn");
        reportCheckoutError(reason.trim() || "Payment failed. Try another method or refresh and try again.");
        finishCheckout(false);
      });

      rzp.on("payment.error", (response) => {
        const reason = typeof response.error === "object" && response.error && "description" in response.error
          ? String((response.error as { description?: string }).description ?? "")
          : "";
        const code = typeof response.error === "object" && response.error && "code" in response.error
          ? String((response.error as { code?: string }).code ?? "")
          : "";
        logRazorpayClientEvent("payment_error", {
          orderId: input.orderId,
          code: code || null,
          reason: reason || null
        }, "error");
        reportCheckoutError(reason.trim() || "Payment gateway error. Try cards or another UPI app, or switch to Cashfree.");
        finishCheckout(false);
      });

      setLoading(null);
      rzp.open();
      logRazorpayClientEvent("checkout_opened", { orderId: input.orderId });

      stopCheckoutStatusPolling();
      checkoutPollRef.current = setInterval(() => {
        void waitForCheckoutPaymentConfirmation({
          orderId: input.orderId,
          email: input.email,
          signedIn: input.signedIn
        }).then((confirmed) => {
          if (!confirmed || verifyingPaymentRef.current) return;
          logRazorpayClientEvent("payment_confirmed_via_poll", { orderId: input.orderId });
          router.push(buildPaymentSuccessUrl(input.orderId, input.signedIn));
          finishCheckout(true);
        });
      }, 2000);
    });
  }

  async function openCashfreeCheckout(input: {
    orderId: string;
    orderNumber: string;
    paymentSessionId: string;
    cashfreeOrderId: string;
    cashfreeMode: "sandbox" | "production";
    email: string;
    signedIn: boolean;
  }) {
    const loaded = await raceWithTimeout(
      ensureCashfreeCheckoutScript(),
      undefined,
      "Load Cashfree checkout"
    );
    if (!loaded || !window.Cashfree) {
      reportCheckoutError("Payment gateway failed to load. Please refresh and try again.");
      return false;
    }

    const cashfree = window.Cashfree({ mode: input.cashfreeMode });
    const preferRedirect = typeof window !== "undefined"
      && window.matchMedia("(max-width: 768px)").matches;
    const result = await raceWithTimeout(
      cashfree.checkout({
        paymentSessionId: input.paymentSessionId,
        redirectTarget: preferRedirect ? "_self" : "_modal"
      }),
      undefined,
      "Cashfree checkout"
    );

    if (result?.error) {
      reportCheckoutError("Cashfree checkout was interrupted. Please try again.");
      return false;
    }

    setLoading("payment");
    let verification: Awaited<ReturnType<typeof verifyPaymentOnServer>>;
    try {
      verification = await raceWithTimeout(verifyPaymentOnServer({
        orderId: input.orderId,
        provider: "cashfree",
        email: input.email,
        signedIn: input.signedIn,
        cashfreeOrderId: input.cashfreeOrderId
      }), undefined, "Cashfree payment verification");
    } finally {
      setLoading(null);
    }
    if (verification.paid) {
      router.push(buildPaymentSuccessUrl(input.orderId, input.signedIn));
      return true;
    }
    reportCheckoutError(verification.error ?? "We're still confirming your payment. Keep this page open while we retry.");
    return false;
  }

  async function placeOrder() {
    if (loading) return;
    if (!validateBase(true)) return;
    if (!paymentProvider && paymentProviders.length) {
      reportCheckoutError("Choose a payment method to continue.");
      return;
    }

    const requestId = ++checkoutActionRequestIdRef.current;
    const isCurrent = () => checkoutActionRequestIdRef.current === requestId;

    setLoading("payment");
    reportCheckoutError("");
    let settled = false;

    try {
      const leadResult = await saveCheckoutLead();
      if (!leadResult.ok) {
        if (isCurrent()) {
          reportCheckoutError(leadResult.error);
          setLoading(null);
        }
        settled = true;
        return;
      }

      await raceWithTimeout(refreshPricing(), undefined, "Refresh checkout pricing");
      if (isResolving) {
        if (isCurrent()) setLoading(null);
        settled = true;
        return;
      }
      if (pricingChanged) {
        if (isCurrent()) {
          reportCheckoutError("Some prices were updated to match the latest prices. Review your order total, then continue.");
          clearPricingChanged();
          setLoading(null);
        }
        settled = true;
        return;
      }

      const guestHeaders = isSignedIn ? null : await buildGuestRequestHeaders();
      if (!isSignedIn && !guestHeaders?.token) {
        if (isCurrent()) {
          reportCheckoutError("Something went wrong. Refresh the page and try again.");
          setLoading(null);
        }
        settled = true;
        return;
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Idempotency-Key": getCheckoutIdempotencyKey(),
        ...(isSignedIn ? {} : (guestHeaders!.headers as Record<string, string>))
      };

      const response = await fetchWithTimeout("/api/checkout", {
        method: "POST",
        headers,
        body: JSON.stringify(cartPayload)
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (isCurrent()) {
          reportCheckoutError(readCheckoutErrorMessage(response, payload));
          setLoading(null);
        }
        settled = true;
        return;
      }

      const orderNumber = String(payload.orderNumber ?? payload.orderId);
      if (isCurrent()) {
        setCheckoutOrderMeta({ orderId: payload.orderId, paymentIntentId: payload.paymentIntentId });
      }

      if (payload.checkoutUrl) {
        // Navigating away — leave loading set; no stuck-UI risk.
        settled = true;
        window.location.href = payload.checkoutUrl;
        return;
      }

      if (payload.provider === "razorpay") {
        if (!payload.clientSecret || !payload.razorpayKeyId) {
          if (isCurrent()) {
            reportCheckoutError("Razorpay checkout could not be started. Please try again or choose another payment method.");
            setLoading(null);
          }
          settled = true;
          return;
        }
        const paid = await openRazorpayCheckout({
          key: payload.razorpayKeyId,
          orderId: payload.orderId,
          orderNumber,
          razorpayOrderId: payload.clientSecret,
          amountPaise: Number(payload.amountPaise ?? inrToPaise(Number(payload.amount ?? 0))),
          email: checkout.email,
          signedIn: isSignedIn,
          keyMode: payload.razorpayKeyMode ?? null,
          useDashboardConfig: Boolean(payload.razorpayUsesDashboardConfig)
        });
        if (isCurrent()) setLoading(null);
        settled = true;
        if (paid) return;
        return;
      }

      if (payload.provider === "cashfree" && payload.paymentSessionId) {
        const paid = await openCashfreeCheckout({
          orderId: payload.orderId,
          orderNumber,
          paymentSessionId: String(payload.paymentSessionId),
          cashfreeOrderId: String(payload.paymentIntentId),
          cashfreeMode: payload.cashfreeMode === "sandbox" ? "sandbox" : "production",
          email: checkout.email,
          signedIn: isSignedIn
        });
        if (isCurrent()) setLoading(null);
        settled = true;
        if (paid) {
          router.push(buildPaymentSuccessUrl(payload.orderId, isSignedIn));
        }
        return;
      }

      if (payload.provider === "cashfree") {
        if (isCurrent()) {
          reportCheckoutError("Cashfree checkout could not be started. Please try again or choose another payment method.");
          setLoading(null);
        }
        settled = true;
        return;
      }

      if (isCurrent()) {
        markComplete("payment", payload.orderId, orderNumber, Number(payload.amount ?? grandTotal));
        setLoading(null);
      }
      settled = true;
    } catch {
      if (isCurrent()) {
        reportCheckoutError("Something went wrong while placing your order. Please try again.");
        setLoading(null);
      }
      settled = true;
    } finally {
      if (isCurrent()) {
        setLoading(null);
      }
      if (isCurrent() && !settled) {
        reportCheckoutError("Something went wrong. Please try again.");
      }
    }
  }

  async function sendEnquiry() {
    if (loading) return;
    if (!validateBase(false)) return;

    const requestId = ++checkoutActionRequestIdRef.current;
    const isCurrent = () => checkoutActionRequestIdRef.current === requestId;

    setLoading("enquiry");
    reportCheckoutError("");
    let settled = false;

    try {
      const guestHeaders = isSignedIn ? null : await buildGuestRequestHeaders();
      if (!isSignedIn && !guestHeaders?.token) {
        if (isCurrent()) {
          reportCheckoutError("Something went wrong. Refresh the page and try again.");
          setLoading(null);
        }
        settled = true;
        return;
      }

      const headers: Record<string, string> = isSignedIn
        ? {
            "Content-Type": "application/json",
            "X-Idempotency-Key": getCheckoutEnquiryIdempotencyKey()
          }
        : {
            "Content-Type": "application/json",
            "X-Idempotency-Key": getCheckoutEnquiryIdempotencyKey(),
            ...(guestHeaders!.headers as Record<string, string>)
          };

      const message = enquiryMessage.trim() || "Checkout enquiry from cart.";

      const response = await fetchWithTimeout("/api/checkout/enquiry", {
        method: "POST",
        headers,
        body: JSON.stringify({ ...cartPayload, message })
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (isCurrent()) {
          reportCheckoutError(typeof payload.error === "string" ? payload.error : "Could not send enquiry.");
          setLoading(null);
        }
        settled = true;
        return;
      }

      if (isCurrent()) {
        markComplete("enquiry", String(payload.enquiryId ?? ""), String(payload.enquiryReference ?? payload.enquiryId ?? "Enquiry"));
        setLoading(null);
      }
      settled = true;
    } catch {
      if (isCurrent()) {
        reportCheckoutError("Something went wrong while sending your enquiry. Please try again.");
        setLoading(null);
      }
      settled = true;
    } finally {
      if (isCurrent()) {
        setLoading(null);
      }
      if (isCurrent() && !settled) {
        reportCheckoutError("Something went wrong. Please try again.");
      }
    }
  }

  const checkoutBusy = Boolean(loading) || gatewayModalOpen;

  if (!isCartSessionReady || (isBuyNowFlow && !buyNowHasHydrated)) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <header className={styles.pageHeader}>
            <p className={styles.eyebrow}>Checkout</p>
            <h1 className={styles.pageTitle}>Complete your purchase</h1>
            <p className={styles.pageLead}>Loading cart…</p>
          </header>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.pageHeader}>
          <p className={styles.eyebrow}>Checkout</p>
          <h1 className={styles.pageTitle}>Send your enquiry</h1>
          <p className={styles.pageLead}>
            Share your details and cart — our team will follow up. You can create an account to track the request, or continue as a guest.
          </p>
        </header>

        <div className={styles.layout}>
          <section className={styles.formPanel}>
            {completed ? (
              <div className="py-2">
                <CheckCircle2 className={styles.successIcon} aria-hidden="true" />
                <h2 className={styles.successTitle}>
                  {completed.mode === "payment" ? "Payment received" : "Enquiry submitted"}
                </h2>
                <p className={styles.successBody}>
                  {completed.mode === "payment"
                    ? `Order reference ${completed.orderNumber}. Keep this summary for your records.`
                    : `Reference ${completed.orderNumber}. Our team will review your request and contact ${completed.fullName || "you"} at ${completed.phone}.`}
                </p>

                <CheckoutInvoice completed={completed} items={items} />

                <div className={styles.actions}>
                  {completed.mode === "payment" ? (
                    <>
                      {completed.isSignedIn && !isStorefrontGuestOnly() ? (
                        <Button asChild variant="accent">
                          <Link href="/account/orders">View orders</Link>
                        </Button>
                      ) : !isStorefrontGuestOnly() ? (
                        <Button asChild variant="accent">
                          <Link href={`/login?next=${encodeURIComponent("/account/orders")}`}>Create account to track orders</Link>
                        </Button>
                      ) : null}
                    </>
                  ) : (
                    <>
                      {completed.isSignedIn && !isStorefrontGuestOnly() ? (
                        <Button asChild variant="accent">
                          <Link href="/account/enquiries">View my enquiries</Link>
                        </Button>
                      ) : !isStorefrontGuestOnly() ? (
                        <Button asChild variant="accent">
                          <Link href={`/login?next=${encodeURIComponent("/account/enquiries")}`}>Create account to track your enquiry</Link>
                        </Button>
                      ) : null}
                    </>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (isBuyNowFlow) {
                        clearBuyNow();
                      } else {
                        clearCart();
                      }
                      setCompleted(null);
                      setEnquiryMessage("");
                      setFullName("");
                      setGuestAddress(emptyGuestAddress());
                    }}
                  >
                    Start new order
                  </Button>
                </div>
              </div>
            ) : (
              <form
                id="checkout-form"
                className={cn(styles.form, "pb-24 lg:pb-0")}
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendEnquiry();
                }}
              >
                <fieldset className={styles.fieldset}>
                  <legend className={styles.legend}>Your contact details</legend>
                  <p className={styles.fieldHint}>{CUSTOMER_CONTACT_REQUIRED_MESSAGE}</p>
                  <div className={cn(styles.fieldGrid, styles.fieldGridTwo)}>
                    <label className={styles.field}>
                      <span className={styles.label}>Full name <span className={styles.required}>*</span></span>
                      <input
                        required
                        type="text"
                        autoComplete="name"
                        value={fullName}
                        onChange={(event) => {
                          contactTouchedRef.current.fullName = true;
                          setFullName(event.target.value);
                        }}
                        className={styles.input}
                      />
                    </label>
                    <div className={styles.field}>
                      <span className={styles.label}>Mobile number <span className={styles.required}>*</span></span>
                      <PhoneCountryField
                        countryCode={phoneCountryCode}
                        national={phoneNational}
                        onCountryChange={(code) => {
                          contactTouchedRef.current.phone = true;
                          setPhoneCountryCode(code);
                        }}
                        onNationalChange={(national) => {
                          contactTouchedRef.current.phone = true;
                          setPhoneNational(national);
                        }}
                        selectClassName={styles.input}
                        inputClassName={styles.input}
                      />
                    </div>
                    <label className={cn(styles.field, styles.fieldGridFull)}>
                      <span className={styles.label}>Email <span className={styles.required}>*</span></span>
                      <input
                        required
                        type="email"
                        autoComplete="email"
                        value={checkout.email}
                        onChange={(event) => {
                          contactTouchedRef.current.email = true;
                          setCheckoutEmail(event.target.value);
                        }}
                        className={styles.input}
                      />
                    </label>
                  </div>
                </fieldset>

                {!isSignedIn && !isStorefrontGuestOnly() ? (
                  <div className={styles.fieldset} data-testid="checkout-auth-prompt">
                    <p className={styles.legend}>Track this request</p>
                    <p className={styles.fieldHint}>
                      Optional — log in or create an account so you can follow this enquiry. You can still send it as a guest.
                    </p>
                    <div className={styles.actions}>
                      <Button asChild variant="outline" type="button">
                        <Link href={loginNextHref}>Log in</Link>
                      </Button>
                      <Button asChild variant="outline" type="button">
                        <Link href={signupNextHref}>Create account</Link>
                      </Button>
                    </div>
                  </div>
                ) : null}

                <details className={styles.fieldset} open={showEnquiry} onToggle={(event) => setShowEnquiry((event.target as HTMLDetailsElement).open)}>
                  <summary className={styles.legend}>Message (optional)</summary>
                  <label className={styles.field}>
                    <span className={styles.label}>Anything we should know?</span>
                    <textarea
                      value={enquiryMessage}
                      onChange={(event) => setEnquiryMessage(event.target.value)}
                      rows={4}
                      className={styles.textarea}
                      placeholder="Share quantity, delivery timeline, or any questions."
                    />
                  </label>
                </details>

                <div className={styles.actions}>
                  <Button type="submit" variant="accent" disabled={checkoutBusy || !checkoutItems.length}>
                    {loading === "enquiry" ? "Sending enquiry..." : "Send enquiry to Mithron"}
                  </Button>
                </div>

                {error ? <p className={styles.error} role="alert">{error}</p> : null}

                <fieldset className={styles.fieldset}>
                  <legend className={styles.legend}>Delivery address</legend>
                  <p className={styles.fieldHint}>Required only if you pay online now.</p>

                  {isSignedIn && shippingAddresses.length ? (
                    <div className={styles.fieldGrid}>
                      {shippingAddresses.map((address) => (
                        <button
                          key={address.id}
                          type="button"
                          onClick={() => {
                            setShowNewAddressForm(false);
                            setShippingAddressId(address.id);
                          }}
                          className={cn(
                            styles.addressCard,
                            checkout.shippingAddressId === address.id && !showNewAddressForm && styles.addressCardSelected
                          )}
                        >
                          <p className={styles.addressCardTitle}>{address.label ?? "Address"}</p>
                          <p className={styles.addressCardBody}>
                            {address.line1}, {address.city}, {address.region} {address.postal_code}
                          </p>
                        </button>
                      ))}
                      <button
                        type="button"
                        className={styles.textLink}
                        onClick={() => {
                          setShowNewAddressForm(true);
                          setShippingAddressId("");
                        }}
                      >
                        Add new address
                      </button>
                    </div>
                  ) : null}

                  {!usingSavedAddress ? (
                    <div className={styles.addressForm}>
                      <div className={cn(styles.fieldGrid, styles.fieldGridTwo)}>
                        <label className={styles.field}>
                          <span className={styles.label}>Address type</span>
                          <select
                            value={guestAddress.label}
                            onChange={(event) => setGuestAddress((current) => ({ ...current, label: event.target.value }))}
                            className={styles.input}
                          >
                            <option value="Home">Home</option>
                            <option value="Office">Office</option>
                          </select>
                        </label>
                      </div>
                      <label className={styles.field}>
                        <span className={styles.label}>House / flat / apartment</span>
                        <input
                          value={guestAddress.line2}
                          onChange={(event) => setGuestAddress((current) => ({ ...current, line2: event.target.value }))}
                          className={styles.input}
                          autoComplete="address-line2"
                        />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.label}>Street</span>
                        <input
                          value={guestAddress.line1}
                          onChange={(event) => setGuestAddress((current) => ({ ...current, line1: event.target.value }))}
                          className={styles.input}
                          autoComplete="street-address"
                        />
                      </label>
                      <div className={cn(styles.fieldGrid, styles.fieldGridTwo)}>
                        <label className={styles.field}>
                          <span className={styles.label}>City</span>
                          <input
                            value={guestAddress.city}
                            onChange={(event) => setGuestAddress((current) => ({ ...current, city: event.target.value }))}
                            className={styles.input}
                            autoComplete="address-level2"
                          />
                        </label>
                        <label className={styles.field}>
                          <span className={styles.label}>Pincode</span>
                          <input
                            value={guestAddress.postalCode}
                            onChange={(event) => setGuestAddress((current) => ({ ...current, postalCode: event.target.value }))}
                            className={styles.input}
                            autoComplete="postal-code"
                          />
                        </label>
                      </div>
                      <label className={styles.field}>
                        <span className={styles.label}>State</span>
                        <input
                          value={guestAddress.region}
                          onChange={(event) => setGuestAddress((current) => ({ ...current, region: event.target.value }))}
                          className={styles.input}
                          autoComplete="address-level1"
                        />
                      </label>
                    </div>
                  ) : null}

                  <label className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={billingSameAsShipping}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setBillingSameAsShipping(checked);
                        if (checked) {
                          setShowManualBillingForm(false);
                        }
                      }}
                      className={styles.checkbox}
                    />
                    <span>Billing address is the same as shipping address</span>
                  </label>
                </fieldset>

                {!billingSameAsShipping ? (
                <fieldset className={styles.fieldset}>
                  <legend className={styles.legend}>Billing address</legend>
                  {isSignedIn && billingAddresses.length > 0 ? (
                    <div className={styles.fieldGrid}>
                      <p className={styles.fieldHint}>Select a saved billing address or enter a new one.</p>
                      {billingAddresses.map((address) => (
                        <button
                          key={`billing-${address.id}`}
                          type="button"
                          onClick={() => {
                            setBillingAddressId(address.id);
                            setShowManualBillingForm(false);
                          }}
                          className={cn(
                            styles.addressCard,
                            billingAddressId === address.id && !showManualBillingForm && styles.addressCardSelected
                          )}
                        >
                          <p className={styles.addressCardTitle}>{address.label ?? "Address"}</p>
                          <p className={styles.addressCardBody}>
                            {address.line1}, {address.city}, {address.region} {address.postal_code}
                          </p>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          if (showManualBillingForm) {
                            setShowManualBillingForm(false);
                            const defaultBilling = billingAddresses.find((address) => address.is_default) ?? billingAddresses[0];
                            if (defaultBilling) {
                              setBillingAddressId(defaultBilling.id);
                            }
                          } else {
                            setBillingAddressId("");
                            setShowManualBillingForm(true);
                          }
                        }}
                        className={styles.textLink}
                      >
                        {showManualBillingForm ? "Use a saved address" : "Enter a different address"}
                      </button>
                      {showManualBillingForm ? (
                        <div className={styles.addressForm}>
                          <p className={styles.label}>Billing address</p>
                          <label className={styles.field}>
                            <span className={styles.label}>Address line</span>
                            <input
                              value={guestBillingAddress.line1}
                              onChange={(event) => setGuestBillingAddress((current) => ({ ...current, line1: event.target.value }))}
                              className={styles.input}
                              autoComplete="billing street-address"
                            />
                          </label>
                          <div className={cn(styles.fieldGrid, styles.fieldGridTwo)}>
                            <label className={styles.field}>
                              <span className={styles.label}>City</span>
                              <input
                                value={guestBillingAddress.city}
                                onChange={(event) => setGuestBillingAddress((current) => ({ ...current, city: event.target.value }))}
                                className={styles.input}
                                autoComplete="billing address-level2"
                              />
                            </label>
                            <label className={styles.field}>
                              <span className={styles.label}>Postal code</span>
                              <input
                                value={guestBillingAddress.postalCode}
                                onChange={(event) => setGuestBillingAddress((current) => ({ ...current, postalCode: event.target.value }))}
                                className={styles.input}
                                autoComplete="billing postal-code"
                              />
                            </label>
                          </div>
                          <label className={styles.field}>
                            <span className={styles.label}>State / region</span>
                            <input
                              value={guestBillingAddress.region}
                              onChange={(event) => setGuestBillingAddress((current) => ({ ...current, region: event.target.value }))}
                              className={styles.input}
                              autoComplete="billing address-level1"
                            />
                          </label>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className={styles.addressForm}>
                      <p className={styles.label}>Billing address</p>
                      <label className={styles.field}>
                        <span className={styles.label}>Address line</span>
                        <input
                          value={guestBillingAddress.line1}
                          onChange={(event) => setGuestBillingAddress((current) => ({ ...current, line1: event.target.value }))}
                          className={styles.input}
                          autoComplete="billing street-address"
                        />
                      </label>
                      <div className={cn(styles.fieldGrid, styles.fieldGridTwo)}>
                        <label className={styles.field}>
                          <span className={styles.label}>City</span>
                          <input
                            value={guestBillingAddress.city}
                            onChange={(event) => setGuestBillingAddress((current) => ({ ...current, city: event.target.value }))}
                            className={styles.input}
                            autoComplete="billing address-level2"
                          />
                        </label>
                        <label className={styles.field}>
                          <span className={styles.label}>Postal code</span>
                          <input
                            value={guestBillingAddress.postalCode}
                            onChange={(event) => setGuestBillingAddress((current) => ({ ...current, postalCode: event.target.value }))}
                            className={styles.input}
                            autoComplete="billing postal-code"
                          />
                        </label>
                      </div>
                      <label className={styles.field}>
                        <span className={styles.label}>State / region</span>
                        <input
                          value={guestBillingAddress.region}
                          onChange={(event) => setGuestBillingAddress((current) => ({ ...current, region: event.target.value }))}
                          className={styles.input}
                          autoComplete="billing address-level1"
                        />
                      </label>
                    </div>
                  )}
                </fieldset>
                ) : null}

                {paymentProviders.length > 0 ? (
                  <CheckoutPaymentStepLazy
                    paymentProviders={paymentProviders}
                    paymentProvider={paymentProvider}
                    onPaymentProviderChange={setPaymentProvider}
                  />
                ) : null}

                <div className={styles.actions}>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={checkoutBusy || !checkoutItems.length}
                    onClick={() => void placeOrder()}
                  >
                    {loading === "payment" || loading === "stub"
                      ? "Processing payment..."
                      : "Pay and place order"}
                  </Button>
                </div>
              </form>
            )}
          </section>

          {!completed ? (
            <div className={styles.summarySlot}>
              <CheckoutOrderSummary
                promoCode={checkout.promoCode}
                checkoutBusy={checkoutBusy}
                checkoutFormId="checkout-form"
                itemsOverride={checkoutItems}
                checkoutMode={flow}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
