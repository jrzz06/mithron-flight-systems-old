"use client";

import { useEffect, useState } from "react";
import { useAdminOrdersLiveState } from "@/components/admin/orders/admin-orders-live-state";
import { readPaymentLifecycle } from "@/lib/orders/payment-lifecycle";
import {
  OrderDetailSection,
  OrderField,
  OrderFieldGrid,
  OrderIdText,
  orderHoverClass
} from "@/components/admin/orders/order-detail-primitives";
import { orderNestedCardPad, orderRadiusControl, orderSectionStack } from "@/components/admin/orders/order-layout-utils";
import { OrderStatusBadge } from "@/components/admin/orders/order-status-badge";
import { moneyText, orderMetadata, text, type AdminRow } from "@/components/admin/orders/order-view-helpers";
import { paymentStatusLabel } from "@/lib/orders/status";

type PaymentRow = {
  provider?: string;
  provider_payment_id?: string;
  provider_intent_id?: string;
  status?: string;
  verified_at?: string;
  amount?: number;
};

type EnrichmentPayload = {
  payments?: PaymentRow[];
};

type AdminOrderPaymentSectionProps = {
  order: AdminRow;
  orderId: string;
};

export function AdminOrderPaymentSection({ order, orderId }: AdminOrderPaymentSectionProps) {
  const metadata = orderMetadata(order);
  const lifecycleState = readPaymentLifecycle(metadata);
  const paymentLifecycle =
    metadata.payment_lifecycle && typeof metadata.payment_lifecycle === "object" && !Array.isArray(metadata.payment_lifecycle)
      ? (metadata.payment_lifecycle as Record<string, unknown>)
      : {};
  const paymentProvider = text(metadata.payment_provider) || text(paymentLifecycle.provider);
  const paymentMethod = text(metadata.payment_method);
  const { getPaymentVersion } = useAdminOrdersLiveState();
  const paymentVersion = getPaymentVersion(orderId);
  const [enrichment, setEnrichment] = useState<EnrichmentPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/enrichment`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { payments: [] }))
      .then((payload: EnrichmentPayload) => {
        if (!cancelled) setEnrichment(payload);
      })
      .catch(() => {
        if (!cancelled) setEnrichment({ payments: [] });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, paymentVersion]);

  const payments = enrichment?.payments ?? [];
  const primaryPayment = payments[0];

  return (
    <OrderDetailSection title="Payment">
      <div className={orderSectionStack}>
        <OrderStatusBadge
          status={text(order.payment_status, "not_required")}
          label={paymentStatusLabel(text(order.payment_status, "not_required"))}
        />
        <OrderFieldGrid columns={2}>
        <OrderField label="Method" value={paymentMethod || paymentProvider || "—"} />
        <OrderField label="Provider" value={paymentProvider || "—"} />
        <OrderField label="Verification" value={lifecycleState.replaceAll("_", " ")} />
        <OrderField label="Total" value={moneyText(order.total)} />
      </OrderFieldGrid>
      {loading ? (
        <p className="platform-type-body text-[var(--platform-text-muted)]">Loading gateway details…</p>
      ) : primaryPayment ? (
        <div className={`border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] ${orderNestedCardPad} ${orderRadiusControl} ${orderHoverClass()}`}>
          <OrderFieldGrid columns={2}>
            <OrderField
              label="Transaction ID"
              value={
                text(primaryPayment.provider_payment_id) ? (
                  <OrderIdText value={text(primaryPayment.provider_payment_id)} showCopy className="font-mono text-xs" />
                ) : (
                  "—"
                )
              }
            />
            <OrderField
              label="Intent ID"
              value={
                text(primaryPayment.provider_intent_id) ? (
                  <OrderIdText value={text(primaryPayment.provider_intent_id)} showCopy className="font-mono text-xs" />
                ) : (
                  "—"
                )
              }
            />
            <OrderField label="Gateway status" value={text(primaryPayment.status, "—")} />
            {primaryPayment.verified_at ? (
              <OrderField
                label="Verified"
                value={text(primaryPayment.verified_at).slice(0, 19).replace("T", " ")}
              />
            ) : null}
          </OrderFieldGrid>
        </div>
      ) : (
        <p className="platform-type-body text-[var(--platform-text-muted)]">No gateway payment record.</p>
      )}
      {text(order.status) === "refunded" ? (
        <p className="platform-type-body text-rose-300">Refund recorded</p>
      ) : null}
      </div>
    </OrderDetailSection>
  );
}
