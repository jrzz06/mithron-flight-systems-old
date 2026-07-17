"use client";

import { customerOrderSourceLabel } from "@/lib/orders/lifecycle";
import { OrderDetailCard } from "@/components/admin/orders/order-detail-primitives";
import { orderLongText } from "@/components/admin/orders/order-layout-utils";
import { orderDateTime, type AdminRow } from "@/components/admin/orders/order-view-helpers";

type AdminOrderSummarySectionProps = {
  order: AdminRow;
  defaultWarehouseCode: string;
};

export function AdminOrderSummarySection({ order }: AdminOrderSummarySectionProps) {
  return (
    <OrderDetailCard title="Order summary">
      <p className={`platform-type-body ${orderLongText}`}>
        <span className="font-medium text-[var(--platform-text-primary)]">{customerOrderSourceLabel(order)}</span>
        <span className="text-[var(--platform-text-muted)]"> · </span>
        <span className="text-[var(--platform-text-secondary)]">{orderDateTime(order)}</span>
      </p>
    </OrderDetailCard>
  );
}
