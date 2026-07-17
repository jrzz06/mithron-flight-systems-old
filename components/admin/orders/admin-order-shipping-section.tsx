"use client";

import { wrapServerAction } from "@/hooks/use-async-action";

import Link from "next/link";
import { useState } from "react";
import { useOptionalAdminRealtime } from "@/components/admin/realtime/admin-realtime-provider";
import { formatAddressInline, pickAddressFromMetadata } from "@/lib/addresses/format";
import { runOrderFormActionWithConflictRetry } from "@/lib/admin/order-action-client";
import type { AdminOrderFormAction } from "@/lib/admin/order-action-result";
import { markControlPlaneLiveSyncFlush } from "@/lib/control-plane/shared-live-sync-coordinator";
import { isActionNavigationError } from "@/lib/server-action-errors";
import { OperationalSubmitButton } from "@/components/admin/operational-submit-button";
import { useAdminOrdersLiveState } from "@/components/admin/orders/admin-orders-live-state";
import { OrderDetailSection, OrderField, OrderFieldGrid } from "@/components/admin/orders/order-detail-primitives";
import {
  orderInlineButtonClass,
  orderInputClass,
  orderLongText,
  orderNestedCardPad,
  orderRadiusControl,
  orderSectionStack
} from "@/components/admin/orders/order-layout-utils";
import { OrderStatusBadge } from "@/components/admin/orders/order-status-badge";
import {
  assignedWarehouseCode,
  orderMetadata,
  text,
  type AdminRow
} from "@/components/admin/orders/order-view-helpers";

type AdminOrderShippingSectionProps = {
  order: AdminRow;
  shipments: AdminRow[];
  defaultWarehouseCode: string;
  updateShippingAddressAction?: AdminOrderFormAction;
  queue?: string;
  filtersQuery?: string;
};

function readShipmentTracking(order: AdminRow) {
  const raw = order.shipment_tracking;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

const fieldClassName = `${orderInputClass} ${orderRadiusControl}`;

export function AdminOrderShippingSection({
  order,
  shipments,
  defaultWarehouseCode,
  updateShippingAddressAction,
  queue = "active",
  filtersQuery = ""
}: AdminOrderShippingSectionProps) {
  const realtime = useOptionalAdminRealtime();
  const { patchOrder } = useAdminOrdersLiveState();
  const metadata = orderMetadata(order);
  const shippingAddress = formatAddressInline(pickAddressFromMetadata(metadata, "shipping"));
  const billingAddress = formatAddressInline(pickAddressFromMetadata(metadata, "billing"));
  const billingSameAsShipping = metadata.billing_same_as_shipping !== false;
  const warehouse = assignedWarehouseCode(order, defaultWarehouseCode);
  const tracking = readShipmentTracking(order);
  const [showEditor, setShowEditor] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const canEditAddress = Boolean(updateShippingAddressAction)
    && !["cancelled", "delivered", "returned", "refunded", "dispatched", "in_transit"].includes(text(order.status, "draft"));

  return (
    <OrderDetailSection title="Shipping">
      <div className={orderSectionStack}>
        <OrderStatusBadge status={text(order.fulfillment_status, "pending")} />
        <OrderFieldGrid columns={2}>
        <OrderField
          label="Warehouse"
          value={
            <Link href="/warehouse/orders" className="text-violet-300 hover:underline">
              {warehouse}
            </Link>
          }
        />
        {shippingAddress ? <OrderField label="Shipping address" value={shippingAddress} /> : null}
        {billingAddress ? (
          <OrderField
            label="Billing address"
            value={`${billingAddress}${billingSameAsShipping ? " (same as shipping)" : ""}`}
          />
        ) : null}
        {text(tracking?.carrier) ? <OrderField label="Courier" value={text(tracking?.carrier)} /> : null}
        {text(tracking?.tracking) ? <OrderField label="Tracking" value={text(tracking?.tracking)} /> : null}
        {text(tracking?.estimated_delivery) ? (
          <OrderField label="ETA" value={text(tracking?.estimated_delivery)} />
        ) : null}
      </OrderFieldGrid>

      {!shippingAddress ? (
        <p className="platform-type-body text-[var(--platform-text-muted)]">No shipping address yet.</p>
      ) : null}

      {canEditAddress && !showEditor ? (
        <button
          type="button"
          onClick={() => {
            setSaveError(null);
            setShowEditor(true);
          }}
          className={`${orderInlineButtonClass} w-fit text-[var(--platform-text-primary)] hover:bg-[var(--platform-surface)]`}
        >
          {shippingAddress ? "Edit address" : "Add shipping address"}
        </button>
      ) : null}

      {canEditAddress && showEditor && updateShippingAddressAction ? (
        <form
          action={wrapServerAction(async (formData) => {
            const orderId = text(order.id);
            setSaveError(null);
            let navigated = false;
            try {
              const outcome = await runOrderFormActionWithConflictRetry(updateShippingAddressAction, formData, {
                orderId,
                patchOrder
              });
              if (outcome.kind === "failed") {
                setSaveError("The order changed before the address could be saved. Please try again.");
                return;
              }

              const line1 = String(formData.get("shipping_line1") ?? "").trim();
              const line2 = String(formData.get("shipping_line2") ?? "").trim() || null;
              const city = String(formData.get("shipping_city") ?? "").trim();
              const state = String(formData.get("shipping_state") ?? "").trim();
              const country = String(formData.get("shipping_country") ?? "").trim() || "India";
              const postalCode = String(formData.get("shipping_postal_code") ?? "").trim();
              const shipping = {
                line1,
                line2,
                city,
                state,
                region: state,
                country,
                postal_code: postalCode
              };
              patchOrder(orderId, {
                ...order,
                metadata: {
                  ...metadata,
                  shipping_address: shipping,
                  billing_address: shipping,
                  billing_same_as_shipping: true,
                  needs_address: false
                }
              });
              setShowEditor(false);
            } catch (error) {
              if (isActionNavigationError(error)) {
                navigated = true;
                throw error;
              }
              setSaveError(error instanceof Error ? error.message : "Unable to save shipping address.");
              return;
            } finally {
              if (!navigated) {
                markControlPlaneLiveSyncFlush();
                void realtime?.reconcileResources(["orders"]);
              }
            }
          }, { label: "Save shipping address" })}
          className={`grid gap-2 border border-[var(--platform-border)] p-4 ${orderRadiusControl}`}
        >
          <input type="hidden" name="order_id" value={text(order.id)} />
          <input type="hidden" name="queue" value={queue} />
          <input type="hidden" name="q" value={filtersQuery} />
          {text(order.updated_at) ? (
            <input type="hidden" name="expected_updated_at" value={text(order.updated_at)} />
          ) : null}
          <input type="hidden" name="billing_same_as_shipping" value="true" />
          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            <label className="grid min-w-0 gap-1 text-xs text-[var(--platform-text-muted)] sm:col-span-2">
              Line 1
              <input name="shipping_line1" required className={fieldClassName} />
            </label>
            <label className="grid min-w-0 gap-1 text-xs text-[var(--platform-text-muted)] sm:col-span-2">
              Line 2
              <input name="shipping_line2" className={fieldClassName} />
            </label>
            <label className="grid min-w-0 gap-1 text-xs text-[var(--platform-text-muted)]">
              City
              <input name="shipping_city" required className={fieldClassName} />
            </label>
            <label className="grid min-w-0 gap-1 text-xs text-[var(--platform-text-muted)]">
              State
              <input name="shipping_state" required className={fieldClassName} />
            </label>
            <label className="grid min-w-0 gap-1 text-xs text-[var(--platform-text-muted)]">
              Postal code
              <input name="shipping_postal_code" required className={fieldClassName} />
            </label>
            <label className="grid min-w-0 gap-1 text-xs text-[var(--platform-text-muted)]">
              Country
              <input name="shipping_country" defaultValue="India" className={fieldClassName} />
            </label>
          </div>
          {saveError ? (
            <p className="platform-type-body text-rose-300" role="alert">
              {saveError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <OperationalSubmitButton
              pendingLabel="Saving..."
              className="platform-btn-primary platform-btn-md"
            >
              Save address
            </OperationalSubmitButton>
            <button
              type="button"
              onClick={() => {
                setSaveError(null);
                setShowEditor(false);
              }}
              className="platform-btn-secondary platform-btn-md"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {shipments.length ? (
        <ul className="space-y-2">
          {shipments.map((shipment) => (
            <li
              key={text(shipment.id)}
              className={`border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] ${orderNestedCardPad} ${orderRadiusControl} platform-type-body text-[var(--platform-text-secondary)] ${orderLongText}`}
            >
              {text(shipment.shipment_number, "Shipment")} · {text(shipment.shipment_status, "pending")}
              {text(shipment.carrier_name) ? ` · ${text(shipment.carrier_name)}` : ""}
              {text(shipment.tracking_number) ? ` · ${text(shipment.tracking_number)}` : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p className="platform-type-body text-[var(--platform-text-muted)]">No shipments created yet.</p>
      )}
      </div>
    </OrderDetailSection>
  );
}
