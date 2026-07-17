"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2, Mail } from "lucide-react";
import { buildGuestRequestHeaders } from "@/lib/api/client-audit-token-client";
import {
  clearPendingPaymentVerification,
  readPendingPaymentVerification
} from "@/lib/checkout/pending-payment";
import { isStorefrontGuestOnly } from "@/lib/storefront/guest-demo";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/utils";
import { notify } from "@/lib/feedback/notify";
import { FEEDBACK_MESSAGES } from "@/lib/feedback/messages";
import { useCartStore } from "@/store/cart";
import { useBuyNowStore } from "@/store/buy-now-session";
import styles from "../checkout.module.css";

type SuccessState = {
  orderId: string;
  orderNumber: string;
  total: number;
  email: string;
  isSignedIn: boolean;
  invoiceNumber: string;
  invoiceUrl: string;
  emailSent: boolean;
};

async function fetchCheckoutSuccess(input: {
  orderId: string;
  email: string;
  signedIn: boolean;
}) {
  const guestHeaders = input.signedIn ? null : await buildGuestRequestHeaders();
  if (!input.signedIn && !guestHeaders?.token) return null;

  const query = new URLSearchParams({ orderId: input.orderId });
  if (!input.signedIn && input.email) query.set("email", input.email);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await fetch(`/api/checkout/success?${query.toString()}`, {
      headers: input.signedIn ? undefined : (guestHeaders!.headers as Record<string, string>),
      cache: "no-store"
    });
    if (!response.ok) return null;

    const payload = await response.json().catch(() => null);
    if (!payload) return null;
    if (!payload.invoicePending) return payload;

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return null;
}

export function CheckoutSuccessClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clearCart = useCartStore((state) => state.clearCart);
  const clearBuyNow = useBuyNowStore((state) => state.clearBuyNow);

  const orderId = searchParams.get("orderId")?.trim() ?? "";
  const email = searchParams.get("email")?.trim() ?? "";

  const [state, setState] = useState<"loading" | "success" | "pending" | "error">(() => (orderId ? "loading" : "error"));
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [error, setError] = useState(() => (orderId ? "" : "Order reference is missing."));

  useEffect(() => {
    if (!orderId) {
      return;
    }

    let active = true;

    async function confirmFromServer() {
      const pending = readPendingPaymentVerification();
      const signedIn = !email;
      const guestHeaders = email ? await buildGuestRequestHeaders() : { token: "signed-in", headers: {} as Record<string, string> };

      if (pending && pending.orderId === orderId && pending.razorpayPaymentId && pending.razorpaySignature) {
        const verifyResponse = await fetch("/api/payments/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(email ? guestHeaders.headers : {})
          },
          body: JSON.stringify({
            orderId,
            provider: "razorpay",
            email: pending.email || email,
            razorpayOrderId: pending.razorpayOrderId,
            razorpayPaymentId: pending.razorpayPaymentId,
            razorpaySignature: pending.razorpaySignature
          })
        });
        const verifyPayload = await verifyResponse.json().catch(() => ({}));
        if (!active) return;
        if (verifyResponse.ok && verifyPayload.paid) {
          clearPendingPaymentVerification();
          clearCart();
          clearBuyNow();

          const fulfillment = await fetchCheckoutSuccess({
            orderId,
            email: pending.email || email,
            signedIn: pending.signedIn
          });

          setSuccess({
            orderId,
            orderNumber: String(verifyPayload.orderNumber ?? pending.orderNumber ?? orderId),
            total: Number(fulfillment?.total ?? verifyPayload.total ?? verifyPayload.amount ?? 0),
            email: String(fulfillment?.customerEmail ?? (pending.email || email)),
            isSignedIn: pending.signedIn,
            invoiceNumber: String(fulfillment?.invoiceNumber ?? verifyPayload.invoiceNumber ?? ""),
            invoiceUrl: String(fulfillment?.invoiceUrl ?? verifyPayload.invoiceUrl ?? `/api/invoices/${orderId}`),
            emailSent: Boolean(fulfillment?.emailSent ?? verifyPayload.emailSent)
          });
          setState("success");
          return;
        }
      }

      const query = new URLSearchParams({ orderId });
      if (email) query.set("email", email);

      for (let attempt = 0; attempt < 12; attempt += 1) {
        const statusResponse = await fetch(`/api/checkout/status?${query.toString()}`, {
          headers: email ? guestHeaders.headers : undefined,
          cache: "no-store"
        });
        const statusPayload = await statusResponse.json().catch(() => ({}));
        if (!active) return;

        if (statusResponse.ok && statusPayload.paid) {
          clearPendingPaymentVerification();
          clearCart();
          clearBuyNow();

          const fulfillment = await fetchCheckoutSuccess({
            orderId,
            email,
            signedIn
          });

          setSuccess({
            orderId,
            orderNumber: String(fulfillment?.orderNumber ?? statusPayload.orderNumber ?? orderId),
            total: Number(fulfillment?.total ?? statusPayload.total ?? 0),
            email: String(fulfillment?.customerEmail ?? email),
            isSignedIn: signedIn,
            invoiceNumber: String(fulfillment?.invoiceNumber ?? ""),
            invoiceUrl: String(fulfillment?.invoiceUrl ?? `/api/invoices/${orderId}`),
            emailSent: Boolean(fulfillment?.emailSent)
          });
          setState("success");
          return;
        }

        if (statusPayload.paymentStatus === "failed" || statusPayload.orderPaymentStatus === "failed") {
          setState("error");
          setError("Payment failed. Return to checkout to try again.");
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      setState("pending");
      setError("Your payment is being confirmed. You will receive an email once it is verified.");
    }

    void confirmFromServer();
    return () => {
      active = false;
    };
  }, [orderId, email, clearCart, clearBuyNow]);

  useEffect(() => {
    if (!orderId) return;
    if (state === "success") {
      notify.success(FEEDBACK_MESSAGES.paymentSuccess, { source: "checkout", id: `pay:success:${orderId}` });
      notify.success(FEEDBACK_MESSAGES.checkoutSuccess, { source: "checkout", id: `order:success:${orderId}` });
      return;
    }
    if (state === "error") {
      notify.error(FEEDBACK_MESSAGES.paymentFailure, { source: "checkout", id: `pay:error:${orderId}` });
      return;
    }
    if (state === "pending") {
      notify.info("Payment confirmation pending", {
        source: "checkout",
        id: `pay:pending:${orderId}`,
        description: "Your payment is being confirmed. You will receive an email once it is verified."
      });
    }
  }, [orderId, state]);

  if (state === "loading") {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <p className={styles.pageLead}>Confirming your payment and preparing your invoice…</p>
        </div>
      </div>
    );
  }

  if (state === "success" && success) {
    const invoiceSrc = success.invoiceUrl.includes("?")
      ? success.invoiceUrl
      : email
        ? `${success.invoiceUrl}?email=${encodeURIComponent(email)}`
        : success.invoiceUrl;

    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <div className="py-2">
            <CheckCircle2 className={styles.successIcon} aria-hidden="true" />
            <h1 className={styles.successTitle}>Payment successful</h1>
            <p className={styles.successBody}>
              Order reference {success.orderNumber}. Your payment was verified and your order confirmation is ready below.
            </p>
            {success.total > 0 ? (
              <p className={styles.pageNote}>Amount paid: {formatINR(success.total)}</p>
            ) : null}
            {success.invoiceNumber ? (
              <p className={styles.pageNote}>Invoice: {success.invoiceNumber}</p>
            ) : null}
            {success.email ? (
              <p className={styles.invoiceFootnote}>
                <Mail className="inline-block h-4 w-4 align-text-bottom mr-1" aria-hidden="true" />
                {success.emailSent
                  ? `Invoice and order confirmation sent to ${success.email}.`
                  : `Your invoice is shown below. We could not send email to ${success.email} right now — save or print this page.`}
              </p>
            ) : null}

            <div className={styles.invoiceFrameWrap}>
              <iframe
                title={`Tax invoice ${success.invoiceNumber || success.orderNumber}`}
                src={invoiceSrc}
                className={styles.invoiceFrame}
              />
            </div>

            <div className={styles.actions}>
              <Button asChild variant="outline">
                <a href={invoiceSrc} target="_blank" rel="noopener noreferrer">
                  Open invoice in new tab
                </a>
              </Button>
              {success.isSignedIn && !isStorefrontGuestOnly() ? (
                <Button asChild variant="accent">
                  <Link href="/account/orders">View orders</Link>
                </Button>
              ) : !isStorefrontGuestOnly() ? (
                <Button asChild variant="accent">
                  <Link href={`/login?next=${encodeURIComponent("/account/orders")}`}>Create account to track orders</Link>
                </Button>
              ) : null}
              <Button asChild variant="outline">
                <Link href="/">Continue shopping</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.pageTitle}>{state === "pending" ? "Payment confirmation pending" : "Payment not confirmed"}</h1>
        <p className={styles.pageLead}>{error || "We could not confirm your payment yet."}</p>
        <div className={styles.actions}>
          <Button variant="accent" onClick={() => router.push("/checkout")}>
            Return to checkout
          </Button>
        </div>
      </div>
    </div>
  );
}
