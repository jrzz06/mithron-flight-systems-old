"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AdminOrderActionForm, type AdminOrderFormAction } from "@/components/admin/admin-orders-optimistic";
import { OperationalSubmitButton } from "@/components/admin/operational-submit-button";
import { ActionGroup } from "@/components/admin/orders/order-detail-primitives";
import { wrapServerAction } from "@/hooks/use-async-action";
import {
  orderButtonClass,
  orderCardPad,
  orderInputClass,
  orderLongText,
  orderRadiusCard,
  orderRadiusControl,
  orderRailDivider,
  orderSectionLabel
} from "@/components/admin/orders/order-layout-utils";
import {
  assignedWarehouseCode,
  canCancelOrder,
  canPermanentlyDeleteOrder,
  fulfillmentNextSteps,
  fulfillmentReadinessMessage,
  isHandedOffToWarehouse,
  isOrderArchived,
  isOrderDeleted,
  nextStepForOrder,
  numberText,
  publicOrderLabel,
  text,
  type AdminRow
} from "@/components/admin/orders/order-view-helpers";
import { fulfillmentStatusLabel, paymentStatusLabel } from "@/lib/orders/status";

type AdminOrderActionsRailProps = {
  order: AdminRow;
  orderId: string;
  queue: string;
  query: string;
  warehouses: Array<{ code: string; name: string }>;
  defaultWarehouseCode: string;
  firstItem: AdminRow | null;
  selectedShipments: AdminRow[];
  confirmAdminOrderAction: AdminOrderFormAction;
  rejectAdminOrderAction: AdminOrderFormAction;
  cancelAdminOrderAction: AdminOrderFormAction;
  permanentDeleteAdminOrderAction: (formData: FormData) => Promise<void>;
  assignAdminWarehouseAction: AdminOrderFormAction;
  markOrderPaidAdminOrderAction: AdminOrderFormAction;
  markOrderRefundedAdminOrderAction: AdminOrderFormAction;
  setOrderPaymentRequirementAdminOrderAction: AdminOrderFormAction;
  updateAdminOrderLifecycleAction: AdminOrderFormAction;
  confirmAdminWarehouseHandoffAction: AdminOrderFormAction;
};

function FormContextFields({ queue, query }: { queue: string; query: string }) {
  return (
    <>
      <input type="hidden" name="queue" value={queue} />
      {query ? <input type="hidden" name="q" value={query} /> : null}
    </>
  );
}

const inputClass = `${orderInputClass} ${orderRadiusControl}`;
const buttonClass = `${orderButtonClass} ${orderRadiusControl}`;

export function AdminOrderActionsRail({
  order,
  orderId,
  queue,
  query,
  warehouses,
  defaultWarehouseCode,
  firstItem,
  selectedShipments,
  confirmAdminOrderAction,
  rejectAdminOrderAction,
  cancelAdminOrderAction,
  permanentDeleteAdminOrderAction,
  assignAdminWarehouseAction,
  markOrderPaidAdminOrderAction,
  markOrderRefundedAdminOrderAction,
  setOrderPaymentRequirementAdminOrderAction,
  updateAdminOrderLifecycleAction,
  confirmAdminWarehouseHandoffAction
}: AdminOrderActionsRailProps) {
  const nextStep = nextStepForOrder(order);
  const orderLabel = publicOrderLabel(order);
  const hasInvoice = Boolean(text(order.invoice_url));
  const warehouseCode = assignedWarehouseCode(order, defaultWarehouseCode);
  const warehouseName = warehouses.find((warehouse) => warehouse.code === warehouseCode)?.name ?? warehouseCode;
  const archived = isOrderArchived(order);
  const deleted = isOrderDeleted(order);
  const isClosed = archived || deleted;
  const fulfillment = text(order.fulfillment_status, "pending");
  const handedOffToWarehouse = isHandedOffToWarehouse(order);
  const hasItems = Boolean(firstItem);
  const fulfillmentBlockedMessage = fulfillmentReadinessMessage(order, hasItems);
  const paymentRaw = text(order.payment_status, "not_required");

  const timedPermanentDelete = useMemo(
    () => wrapServerAction(permanentDeleteAdminOrderAction, { label: "Permanently delete order" }),
    [permanentDeleteAdminOrderAction]
  );

  if (handedOffToWarehouse && !isClosed) {
    return (
      <aside
        data-admin-order-actions-rail
        className={`grid w-full min-w-0 gap-4 border border-[var(--platform-border)] bg-[var(--platform-surface)] shadow-sm ${orderRadiusCard} ${orderCardPad}`}
      >
        <div className="min-w-0">
          <h3 className={orderSectionLabel}>Actions</h3>
          <p className={`mt-2 rounded-[8px] border border-cyan-400/55 bg-cyan-500/15 px-3 py-2.5 platform-type-body font-medium leading-relaxed text-cyan-50 ${orderLongText}`}>
            Handed off to warehouse. Admin view is read-only. Only warehouse can update details or cancel &amp; delete this order.
          </p>
        </div>
        <ActionGroup title="Status">
          <p className="platform-type-body text-[var(--platform-text-secondary)]">
            Fulfillment: <span className="font-medium text-[var(--platform-text-primary)]">{fulfillmentStatusLabel(fulfillment)}</span>
          </p>
          {warehouseCode ? (
            <p className="platform-type-body text-[var(--platform-text-secondary)]">
              Warehouse: <span className="font-medium text-[var(--platform-text-primary)]">{warehouseName}</span>
            </p>
          ) : null}
        </ActionGroup>
      </aside>
    );
  }

  return (
    <aside
      data-admin-order-actions-rail
      className={`grid w-full min-w-0 gap-4 border border-[var(--platform-border)] bg-[var(--platform-surface)] shadow-sm ${orderRadiusCard} ${orderCardPad}`}
    >
      <div className="min-w-0">
        <h3 className={orderSectionLabel}>Actions</h3>
        <p className={`platform-type-body leading-relaxed text-[var(--platform-text-secondary)] ${orderLongText}`}>{nextStep.description}</p>
      </div>

      <ActionGroup title="Fulfillment">
        {isClosed ? (
          <p className="platform-type-body text-[var(--platform-text-muted)]">
            This order is no longer active.
          </p>
        ) : null}

        {!isClosed && fulfillmentBlockedMessage ? (
          <p className="platform-type-body text-[var(--platform-text-muted)]">{fulfillmentBlockedMessage}</p>
        ) : null}

        {!isClosed && nextStep.action === "confirm" ? (
          <AdminOrderActionForm orderId={orderId} action={confirmAdminOrderAction} nextStatus="confirmed">
            <input type="hidden" name="order_id" value={orderId} />
            <input type="hidden" name="expected_updated_at" value={text(order.updated_at)} />
            <FormContextFields queue={queue} query={query} />
            <OperationalSubmitButton
              pendingLabel="Working..."
              disabled={Boolean(fulfillmentBlockedMessage)}
              className={`${buttonClass} border border-violet-600 bg-violet-600 text-white disabled:opacity-50`}
            >
              {nextStep.button}
            </OperationalSubmitButton>
          </AdminOrderActionForm>
        ) : null}

        {!isClosed && nextStep.action === "assign" ? (
          <AdminOrderActionForm orderId={orderId} action={assignAdminWarehouseAction} nextStatus="assigned" className="grid gap-2">
            <input type="hidden" name="order_id" value={orderId} />
            <input type="hidden" name="expected_updated_at" value={text(order.updated_at)} />
            <FormContextFields queue={queue} query={query} />
            <input type="hidden" name="warehouse_code" value={warehouseCode} />
            <p className="platform-type-body text-[var(--platform-text-secondary)]">
              Warehouse: <span className="font-medium text-[var(--platform-text-primary)]">{warehouseName}</span>
            </p>
            <OperationalSubmitButton
              pendingLabel="Assigning..."
              disabled={Boolean(fulfillmentBlockedMessage)}
              className={`${buttonClass} border border-cyan-600 bg-cyan-600 text-white disabled:opacity-50`}
            >
              {nextStep.button}
            </OperationalSubmitButton>
          </AdminOrderActionForm>
        ) : null}

        {!isClosed && ["confirmed", "assigned", "processing", "packed", "dispatched"].includes(text(order.status)) ? (
          <AdminOrderActionForm orderId={orderId} action={updateAdminOrderLifecycleAction} className="grid gap-2">
            <input type="hidden" name="order_id" value={orderId} />
            <FormContextFields queue={queue} query={query} />
            <input type="hidden" name="status" value={text(order.status, "confirmed")} />
            <input type="hidden" name="payment_status" value={text(order.payment_status, "not_required")} />
            <input type="hidden" name="change_summary" value={`Operator status update ${orderLabel}`} />
            {fulfillmentNextSteps(text(order.fulfillment_status, "pending")).length ? (
              <>
                <select
                  name="fulfillment_status"
                  defaultValue=""
                  disabled={Boolean(fulfillmentBlockedMessage)}
                  className={inputClass}
                >
                  <option value="">Next fulfillment status</option>
                  {fulfillmentNextSteps(text(order.fulfillment_status, "pending")).map((state) => (
                    <option key={state} value={state}>
                      {fulfillmentStatusLabel(state)}
                    </option>
                  ))}
                </select>
                <input
                  name="note"
                  placeholder="Timeline note (optional)"
                  disabled={Boolean(fulfillmentBlockedMessage)}
                  className={inputClass}
                />
                <OperationalSubmitButton
                  pendingLabel="Updating..."
                  disabled={Boolean(fulfillmentBlockedMessage)}
                  className={`platform-btn-primary ${buttonClass} disabled:opacity-50`}
                >
                  Update fulfillment
                </OperationalSubmitButton>
              </>
            ) : (
              <p className="platform-type-body text-[var(--platform-text-muted)]">No further fulfillment action available.</p>
            )}
          </AdminOrderActionForm>
        ) : null}

        {!isClosed &&
        nextStep.action !== "confirm" &&
        nextStep.action !== "assign" &&
        !["confirmed", "assigned", "processing", "packed", "dispatched"].includes(text(order.status)) ? (
          <p className="platform-type-body text-[var(--platform-text-muted)]">
            {text(order.status) === "draft"
              ? "Add customer, address, and products to unlock fulfillment."
              : nextStep.description}
          </p>
        ) : null}
      </ActionGroup>

      <div className={orderRailDivider}>
        <ActionGroup title="Shipment">
          {!isClosed && ["assigned", "processing", "packed", "dispatched"].includes(text(order.status)) ? (
            <AdminOrderActionForm orderId={orderId} action={confirmAdminWarehouseHandoffAction} className="grid gap-2">
              <input type="hidden" name="order_id" value={orderId} />
              <FormContextFields queue={queue} query={query} />
              <input type="hidden" name="warehouse_id" value={warehouseCode} />
              <input type="hidden" name="order_item_id" value={text(firstItem?.id)} />
              <input type="hidden" name="shipment_product_id" value={text(firstItem?.product_slug)} />
              <input type="hidden" name="shipment_quantity" value={numberText(firstItem?.quantity ?? 1)} />
              <input type="hidden" name="change_summary" value={`Create shipment handoff ${orderLabel}`} />
              <input name="carrier_name" placeholder="Carrier" className={inputClass} />
              <input name="tracking_number" placeholder="Tracking number" className={inputClass} />
              {firstItem ? (
                <OperationalSubmitButton pendingLabel="Creating..." className={`platform-btn-primary ${buttonClass}`}>
                  Create shipment
                </OperationalSubmitButton>
              ) : (
                <p className="platform-type-body text-[var(--platform-text-muted)]">Add items before creating a shipment.</p>
              )}
              {selectedShipments.length ? (
                <p className="platform-type-body text-[var(--platform-text-muted)]">
                  {selectedShipments.length} existing shipment(s)
                </p>
              ) : null}
            </AdminOrderActionForm>
          ) : isClosed ? null : (
            <p className="platform-type-body text-[var(--platform-text-muted)]">Shipment actions unlock once fulfillment starts.</p>
          )}
        </ActionGroup>
      </div>

      {hasInvoice ? (
        <div className={orderRailDivider}>
          <ActionGroup title="Invoice">
            <Link
              href={`/admin/orders/invoice/${encodeURIComponent(orderId)}`}
              className={`inline-flex ${buttonClass} items-center justify-center border border-[var(--platform-border-strong)] font-medium text-violet-300 hover:bg-[var(--platform-surface-muted)]`}
            >
              View / print invoice
            </Link>
          </ActionGroup>
        </div>
      ) : null}

      {text(order.status) === "admin_review" ? (
        <div className={orderRailDivider}>
          <ActionGroup title="Payment">
            <AdminOrderActionForm orderId={orderId} action={rejectAdminOrderAction} nextStatus="cancelled" className="grid gap-2">
              <input type="hidden" name="order_id" value={orderId} />
              <input type="hidden" name="expected_updated_at" value={text(order.updated_at)} />
              <FormContextFields queue={queue} query={query} />
              <input name="reject_reason" placeholder="Rejection note" className={inputClass} />
              <OperationalSubmitButton
                pendingLabel="Rejecting..."
                className={`${buttonClass} border border-rose-700 bg-rose-900/40 text-rose-100`}
              >
                Reject order
              </OperationalSubmitButton>
            </AdminOrderActionForm>
          </ActionGroup>
        </div>
      ) : null}

      {!isClosed && !handedOffToWarehouse ? (
        <div className={orderRailDivider}>
          <ActionGroup title="Payment status">
            <p className="platform-type-body text-[var(--platform-text-secondary)]">
              Current:{" "}
              <span className="font-medium text-[var(--platform-text-primary)]">
                {paymentStatusLabel(paymentRaw)}
              </span>
            </p>
            {text(order.status) === "pending_payment" ? (
              <>
                <AdminOrderActionForm orderId={orderId} action={markOrderPaidAdminOrderAction} nextStatus="paid" className="grid gap-2">
                  <input type="hidden" name="order_id" value={orderId} />
                  <input type="hidden" name="expected_updated_at" value={text(order.updated_at)} />
                  <FormContextFields queue={queue} query={query} />
                  <textarea
                    name="note"
                    rows={2}
                    placeholder="Payment note (optional): UPI ref / bank transfer id"
                    className={`w-full border px-3 py-2 text-sm ${orderRadiusControl}`}
                  />
                  <OperationalSubmitButton
                    pendingLabel="Saving..."
                    className={`${buttonClass} border border-emerald-600 bg-emerald-600 text-white`}
                  >
                    Mark as paid
                  </OperationalSubmitButton>
                  <p className="platform-type-caption">For offline payments only — also advances order status.</p>
                </AdminOrderActionForm>
                <AdminOrderActionForm orderId={orderId} action={cancelAdminOrderAction} nextStatus="cancelled" className="grid gap-2">
                  <input type="hidden" name="order_id" value={orderId} />
                  <input type="hidden" name="expected_updated_at" value={text(order.updated_at)} />
                  <FormContextFields queue={queue} query={query} />
                  <input name="cancel_reason" required placeholder="Cancellation reason" className={inputClass} />
                  <OperationalSubmitButton
                    pendingLabel="Cancelling..."
                    confirmMessage={`Cancel order ${orderLabel}?`}
                    confirmDescription="This cancels the order. Provide a reason above before confirming."
                    className={`${buttonClass} border border-rose-700 bg-rose-900/40 text-rose-100`}
                  >
                    Cancel order
                  </OperationalSubmitButton>
                </AdminOrderActionForm>
              </>
            ) : (
              <>
                {paymentRaw !== "succeeded" ? (
                  <AdminOrderActionForm orderId={orderId} action={setOrderPaymentRequirementAdminOrderAction} className="grid gap-2">
                    <input type="hidden" name="order_id" value={orderId} />
                    <input type="hidden" name="expected_updated_at" value={text(order.updated_at)} />
                    <input type="hidden" name="payment_status" value="succeeded" />
                    <FormContextFields queue={queue} query={query} />
                    <textarea
                      name="note"
                      rows={2}
                      placeholder="Optional note"
                      className={`w-full border px-3 py-2 text-sm ${orderRadiusControl}`}
                    />
                    <OperationalSubmitButton
                      pendingLabel="Saving..."
                      className={`${buttonClass} border border-emerald-600 bg-emerald-600 text-white`}
                    >
                      Mark payment paid
                    </OperationalSubmitButton>
                  </AdminOrderActionForm>
                ) : null}
                {paymentRaw !== "requires_payment" ? (
                  <AdminOrderActionForm orderId={orderId} action={setOrderPaymentRequirementAdminOrderAction} className="grid gap-2">
                    <input type="hidden" name="order_id" value={orderId} />
                    <input type="hidden" name="expected_updated_at" value={text(order.updated_at)} />
                    <input type="hidden" name="payment_status" value="requires_payment" />
                    <FormContextFields queue={queue} query={query} />
                    <OperationalSubmitButton
                      pendingLabel="Saving..."
                      className={`${buttonClass} border border-amber-600 bg-amber-600 text-white`}
                    >
                      Mark payment required
                    </OperationalSubmitButton>
                  </AdminOrderActionForm>
                ) : null}
                {paymentRaw !== "not_required" ? (
                  <AdminOrderActionForm orderId={orderId} action={setOrderPaymentRequirementAdminOrderAction} className="grid gap-2">
                    <input type="hidden" name="order_id" value={orderId} />
                    <input type="hidden" name="expected_updated_at" value={text(order.updated_at)} />
                    <input type="hidden" name="payment_status" value="not_required" />
                    <FormContextFields queue={queue} query={query} />
                    <OperationalSubmitButton
                      pendingLabel="Saving..."
                      className={`${buttonClass} border border-[var(--platform-border-strong)] text-[var(--platform-text-primary)] hover:bg-[var(--platform-surface-muted)]`}
                    >
                      Mark not required
                    </OperationalSubmitButton>
                  </AdminOrderActionForm>
                ) : null}
              </>
            )}
          </ActionGroup>
        </div>
      ) : null}

      {text(order.fulfillment_status) === "returned" && text(order.payment_status) !== "refunded" ? (
        <div className={orderRailDivider}>
          <ActionGroup title="Payment">
            <AdminOrderActionForm orderId={orderId} action={markOrderRefundedAdminOrderAction} nextStatus="refunded" className="grid gap-2">
              <input type="hidden" name="order_id" value={orderId} />
              <input type="hidden" name="expected_updated_at" value={text(order.updated_at)} />
              <FormContextFields queue={queue} query={query} />
              <textarea
                name="note"
                rows={2}
                placeholder="Refund note (optional): gateway ref / UTR / reason"
                className={`w-full border px-3 py-2 text-sm ${orderRadiusControl}`}
              />
              <OperationalSubmitButton
                pendingLabel="Saving..."
                className={`${buttonClass} border border-amber-600 bg-amber-600 text-white`}
              >
                Mark as refunded
              </OperationalSubmitButton>
              <p className="platform-type-caption">
                After gateway or offline refund.
              </p>
            </AdminOrderActionForm>
          </ActionGroup>
        </div>
      ) : null}

      <div className={orderRailDivider}>
        <ActionGroup title="Danger Zone" danger collapsible defaultOpen={false}>
          {!canPermanentlyDeleteOrder(order) && canCancelOrder(order) && !["admin_review", "pending_payment"].includes(text(order.status)) ? (
            <p className="platform-type-body text-[var(--platform-text-muted)]">
              Cancel first, then permanently delete.
            </p>
          ) : null}

          {canCancelOrder(order) && !["admin_review", "pending_payment"].includes(text(order.status)) ? (
            <AdminOrderActionForm orderId={orderId} action={cancelAdminOrderAction} nextStatus="cancelled" className="grid gap-2">
              <input type="hidden" name="order_id" value={orderId} />
              <input type="hidden" name="expected_updated_at" value={text(order.updated_at)} />
              <FormContextFields queue={queue} query={query} />
              <input name="cancel_reason" required placeholder="Cancellation reason" className={inputClass} />
              <OperationalSubmitButton
                pendingLabel="Cancelling..."
                confirmMessage={`Cancel order ${orderLabel}?`}
                confirmDescription="This cancels the order. Provide a reason above before confirming."
                className={`${buttonClass} border border-rose-700 bg-rose-900/40 text-rose-100`}
              >
                Cancel order
              </OperationalSubmitButton>
            </AdminOrderActionForm>
          ) : null}

          {canPermanentlyDeleteOrder(order) ? (
            <form action={timedPermanentDelete} className="grid gap-2">
              <input type="hidden" name="order_id" value={orderId} />
              <FormContextFields queue={queue} query={query} />
              <textarea
                name="delete_reason"
                required
                rows={2}
                placeholder="Permanent delete reason"
                className={`w-full border px-3 py-2 text-sm ${orderRadiusControl}`}
              />
              <input type="hidden" name="expected_updated_at" value={text(order.updated_at)} />
              <OperationalSubmitButton
                pendingLabel="Deleting..."
                confirmMessage={`Permanently delete order ${orderLabel}?`}
                confirmDescription="This cannot be undone. Type the order ID to confirm."
                requireTypedText={orderLabel}
                typedTextLabel={`Type ${orderLabel} to permanently delete`}
                confirmLabel="Delete permanently"
                className={`${buttonClass} border border-rose-700 bg-rose-950/40 text-rose-100`}
              >
                Delete permanently
              </OperationalSubmitButton>
            </form>
          ) : null}
        </ActionGroup>
      </div>
    </aside>
  );
}
