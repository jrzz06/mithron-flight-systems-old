"use client";

import { memo } from "react";
import { OrderProductThumbnail } from "@/components/admin/orders/order-product-thumbnail";
import { AdminOrderRowQuickActions } from "@/components/admin/orders/admin-order-row-quick-actions";
import { OrderIdText, orderHoverClass } from "@/components/admin/orders/order-detail-primitives";
import type { AdminOrderFormAction } from "@/lib/admin/order-action-result";
import { OrderStatusBadge } from "@/components/admin/orders/order-status-badge";
import {
  orderClamp2,
  orderLongText,
  orderRadiusControl,
  orderWrapRow
} from "@/components/admin/orders/order-layout-utils";
import { resolveNextImageSrc } from "@/lib/media/next-image-src";
import {
  assignedWarehouseCode,
  customerName,
  moneyText,
  orderDateParts,
  orderItemsForOrder,
  orderPriorityBadge,
  orderSourceBadge,
  isIncompleteDraftOrder,
  productSummaryLine,
  publicOrderLabel,
  resolveProductImage,
  text,
  type AdminRow
} from "@/components/admin/orders/order-view-helpers";
import { fulfillmentStatusLabel, paymentStatusLabel } from "@/lib/orders/status";

type AdminOrderListItemProps = {
  order: AdminRow;
  orderItems: AdminRow[];
  products: AdminRow[];
  defaultWarehouseCode: string;
  selected: boolean;
  /** Order has unread notifications for the current user (new/updated order). */
  unread?: boolean;
  isPending: boolean;
  hasShipment: boolean;
  href: string;
  /** Stable selection key + index let the parent pass stable handlers so React.memo holds. */
  selectionKey: string;
  index: number;
  onSelectKey: (selectionKey: string) => void;
  onFocusIndex?: (index: number) => void;
  tabIndex?: number;
  queue: string;
  query: string;
  cancelAdminOrderAction?: AdminOrderFormAction;
  permanentDeleteAdminOrderAction?: (formData: FormData) => Promise<void>;
};

function priorityLabel(priority: ReturnType<typeof orderPriorityBadge>) {
  if (priority === "urgent") return { label: "Enquiry", className: "border-amber-500/30 bg-amber-500/10 text-amber-200" };
  if (priority === "action") return { label: "Action", className: "border-violet-500/30 bg-violet-500/10 text-violet-200" };
  if (priority === "payment") return { label: "Unpaid", className: "border-rose-500/30 bg-rose-500/10 text-rose-200" };
  return null;
}

export const AdminOrderListItem = memo(function AdminOrderListItem({
  order,
  orderItems,
  products,
  defaultWarehouseCode,
  selected,
  unread = false,
  isPending,
  hasShipment,
  href,
  selectionKey,
  index,
  onSelectKey,
  onFocusIndex,
  tabIndex = -1,
  queue,
  query,
  cancelAdminOrderAction,
  permanentDeleteAdminOrderAction
}: AdminOrderListItemProps) {
  const orderId = text(order.id);
  const orderNumber = publicOrderLabel(order);
  const warehouse = assignedWarehouseCode(order, defaultWarehouseCode);
  const summary = productSummaryLine(orderId, orderItems);
  const items = orderItemsForOrder(orderId, orderItems);
  const firstItem = items[0];
  const thumb = firstItem ? resolveProductImage(products, text(firstItem.product_slug)) : null;
  const thumbSrc = thumb ? resolveNextImageSrc(thumb) : null;
  const priority = priorityLabel(orderPriorityBadge(order));
  const invoiceReady = Boolean(text(order.invoice_url));
  const { date, time } = orderDateParts(order);
  const productQty = firstItem ? Number(firstItem.quantity ?? 1) || 1 : null;
  const paymentRaw = text(order.payment_status, "not_required");
  const paymentLabel = paymentStatusLabel(paymentRaw);
  const fulfillmentRaw = text(order.fulfillment_status, "pending");
  const fulfillmentLabel = fulfillmentStatusLabel(fulfillmentRaw);
  const incomplete = isIncompleteDraftOrder(order, items.length > 0);
  const source = orderSourceBadge(order);

  return (
    <div
      role="button"
      data-admin-order-row
      aria-current={selected ? "true" : undefined}
      tabIndex={tabIndex}
      onFocus={onFocusIndex ? () => onFocusIndex(index) : undefined}
      onClick={() => onSelectKey(selectionKey)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectKey(selectionKey);
        }
      }}
      onAuxClick={(event) => {
        if (event.button === 1 || event.ctrlKey || event.metaKey) {
          event.preventDefault();
          window.open(href, "_blank", "noopener,noreferrer");
        }
      }}
      className={`relative box-border block w-full shrink-0 cursor-pointer border-b border-[var(--platform-border)] px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 ${orderHoverClass()} hover:bg-[var(--platform-surface-muted)] ${
        selected
          ? "border-l-[3px] border-l-violet-500 bg-violet-500/10 pl-[calc(0.75rem-3px)] shadow-[inset_0_0_0_1px_rgba(124,106,247,0.12)]"
          : unread
            ? "border-l-[3px] border-l-amber-400/70 bg-amber-400/[0.06]"
            : "border-l-[3px] border-l-transparent"
      } ${isPending ? "opacity-60" : ""}`}
    >
      <div className="grid gap-2">
        <div className={`${orderWrapRow} justify-between gap-x-2 gap-y-1`}>
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            {unread && !selected ? (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                role="img"
                aria-label="New activity"
              />
            ) : null}
            <OrderIdText value={orderNumber} className="min-w-0 flex-1 text-sm" showCopy={false} />
          </span>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
            <p className={`shrink-0 platform-type-label font-semibold text-[var(--platform-text-primary)] ${orderLongText}`}>
              {moneyText(order.total)}
            </p>
            {incomplete ? (
              <span
                className={`inline-flex h-6 max-w-full items-center gap-1.5 whitespace-nowrap border border-amber-500/40 bg-amber-500/10 px-2.5 text-[10px] font-medium text-amber-200 ${orderRadiusControl}`}
                title="Order is missing products or address"
              >
                Needs setup
              </span>
            ) : (
              <OrderStatusBadge status={text(order.status, "pending")} compact className="max-w-full" />
            )}
            {fulfillmentRaw !== "pending" ? (
              <span
                className={`inline-flex h-6 max-w-full items-center whitespace-nowrap border border-blue-500/30 bg-blue-500/10 px-2 text-[10px] font-medium text-blue-200 ${orderRadiusControl}`}
                title={`Warehouse fulfillment: ${fulfillmentLabel}`}
              >
                Warehouse: {fulfillmentLabel}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-start gap-2">
          <OrderProductThumbnail src={thumbSrc} size="list" className="shrink-0" />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className={`${orderClamp2} ${orderLongText} platform-type-label font-semibold text-[var(--platform-text-primary)]`}>
              {customerName(order)}
            </p>
            <p className={`truncate platform-type-caption`} title={text(order.customer_email, "No email")}>
              {text(order.customer_email, "No email")}
            </p>
            <p className="line-clamp-1 platform-type-caption text-[var(--platform-text-secondary)]">
              {summary.primary}
              {summary.extra > 0 ? ` +${summary.extra} more` : ""}
              {productQty ? ` · Qty ${productQty}` : ""}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-[var(--platform-border)]/60 pt-1.5 platform-type-caption text-[var(--platform-text-muted)]">
          <span>{warehouse}</span>
          <span aria-hidden>·</span>
          <span>{date}</span>
          <span aria-hidden>·</span>
          <span>{time}</span>
          <span aria-hidden>·</span>
          <span className={orderLongText}>{paymentLabel}</span>
          <span className={`inline-flex h-5 shrink-0 items-center border px-1.5 text-[10px] font-medium ${orderRadiusControl} ${source.className} ${orderLongText}`}>
            {source.label}
          </span>
          {priority ? (
            <span className={`inline-flex h-5 shrink-0 items-center border px-1.5 text-[10px] font-medium ${orderRadiusControl} ${priority.className} ${orderLongText}`}>
              {priority.label}
            </span>
          ) : null}
          {invoiceReady ? <span className="shrink-0 text-emerald-300">Invoice</span> : null}
          {hasShipment ? <span className="shrink-0 text-cyan-300">Shipped</span> : null}
          {isPending ? (
            <span className="shrink-0 font-medium text-[var(--platform-accent)]">Updating…</span>
          ) : null}
        </div>

        {cancelAdminOrderAction && permanentDeleteAdminOrderAction ? (
          <AdminOrderRowQuickActions
            order={order}
            queue={queue}
            query={query}
            cancelAdminOrderAction={cancelAdminOrderAction}
            permanentDeleteAdminOrderAction={permanentDeleteAdminOrderAction}
          />
        ) : null}
      </div>
    </div>
  );
});

