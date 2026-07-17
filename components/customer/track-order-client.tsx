"use client";

import { useState } from "react";
import { AccountCard, AccountField, AccountInput, AccountSection } from "@/components/account";
import { OrderProgressTracker } from "@/components/customer/order-progress-tracker";
import { Button } from "@/components/ui/button";
import { customerPaymentStatus } from "@/lib/customer/copy";
import { formatOrderReference } from "@/lib/customer/display";
import {
  buildCustomerProgressSteps,
  currentCustomerProgressLabel,
  customerOrderSourceLabel,
  resolveCustomerSource
} from "@/lib/orders/lifecycle";
import { formatINR } from "@/lib/utils";

type TrackingResult = {
  order: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
};

import { parseShipmentTracking } from "@/lib/customer/shipment-tracking";
function estimatedDelivery(order: Record<string, unknown>) {
  const metadata = order.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const record = metadata as Record<string, unknown>;
  const value = record.estimated_delivery ?? record.estimated_delivery_date;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function TrackOrderClient() {
  const [orderNumber, setOrderNumber] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TrackingResult | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const params = new URLSearchParams({ orderNumber, email });
      const response = await fetch(`/api/orders/track?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok) {
        setError(typeof payload.error === "string" ? payload.error : "We couldn't find an order with those details.");
        return;
      }
      setResult({ order: payload.order, items: payload.items ?? [] });
    } catch {
      setError("We couldn't look up your order. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const order = result?.order;
  const tracking = order ? parseShipmentTracking(order.shipment_tracking) : null;
  const orderSource = order ? resolveCustomerSource(order) : "checkout";
  const progressSteps = order ? buildCustomerProgressSteps(order) : [];
  const progressLabel = order ? currentCustomerProgressLabel(order) : "";
  const paymentLabel = order
    ? customerPaymentStatus(String(order.payment_status ?? "pending"))
    : "";

  return (
    <div className="account-hub grid gap-6">
      <AccountCard>
        <p className="text-sm text-[var(--account-ink-muted)]">
          Enter your order number and the email address used at checkout.
        </p>
        <form onSubmit={onSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
          <AccountField label="Order number">
            <AccountInput
              required
              value={orderNumber}
              onChange={(event) => setOrderNumber(event.target.value)}
              placeholder="ORD-..."
            />
          </AccountField>
          <AccountField label="Email address">
            <AccountInput
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </AccountField>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={loading}>
              {loading ? "Looking up…" : "Track order"}
            </Button>
          </div>
          {error ? <p className="text-sm text-[var(--account-danger)] sm:col-span-2">{error}</p> : null}
        </form>
      </AccountCard>

      {order ? (
        <AccountCard>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="type-section text-[var(--account-ink)]">{formatOrderReference(order)}</h2>
            <span className="rounded-full border border-[var(--account-border)] px-3 py-1 text-sm font-medium text-[var(--account-ink)]">
              {progressLabel}
            </span>
          </div>
          <p className="mt-2 text-sm text-[var(--account-ink-muted)]">
            Total: {formatINR(Number(order.total ?? 0))}
          </p>

          <div className="mt-6">
            <OrderProgressTracker
              steps={progressSteps}
              paymentLabel={paymentLabel}
              tracking={tracking}
              estimatedDelivery={estimatedDelivery(order)}
              orderSource={orderSource}
              sourceLabel={customerOrderSourceLabel(order)}
            />
          </div>

          <AccountSection title="Items in this order" className="mt-6">
            <ul className="grid gap-3">
              {(result?.items ?? []).map((item, index) => (
                <li
                  key={`${item.product_slug}-${index}`}
                  className="rounded-2xl border border-[var(--account-border)] bg-[var(--account-surface-muted)] p-4"
                >
                  <p className="font-semibold text-[var(--account-ink)]">
                    {String(item.product_name ?? item.product_slug)}
                  </p>
                  <p className="mt-1 text-sm text-[var(--account-ink-muted)]">
                    Quantity {String(item.quantity ?? 1)} · {formatINR(Number(item.line_total ?? 0))}
                  </p>
                </li>
              ))}
            </ul>
          </AccountSection>
        </AccountCard>
      ) : null}
    </div>
  );
}
