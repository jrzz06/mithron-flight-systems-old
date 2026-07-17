"use client";

import Link from "next/link";
import { OrderDetailSection, OrderField, OrderFieldGrid } from "@/components/admin/orders/order-detail-primitives";
import {
  orderClamp2,
  orderLongText,
  orderNestedCardPad,
  orderRadiusControl,
  orderSectionStack,
  orderTruncateEllipsis
} from "@/components/admin/orders/order-layout-utils";
import {
  buildOrdersUrl,
  customerName,
  orderMetadata,
  orderPhone,
  orderSelectionKey,
  priorOrdersForCustomer,
  publicOrderLabel,
  text,
  type AdminRow
} from "@/components/admin/orders/order-view-helpers";

type AdminOrderCustomerSectionProps = {
  order: AdminRow;
  allOrders: AdminRow[];
  queue: string;
  filtersQuery: string;
  onSelectOrder?: (orderNumber: string) => void;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export function AdminOrderCustomerSection({
  order,
  allOrders,
  queue,
  filtersQuery,
  onSelectOrder
}: AdminOrderCustomerSectionProps) {
  const metadata = orderMetadata(order);
  const name = customerName(order);
  const prior = priorOrdersForCustomer(order, allOrders);

  return (
    <OrderDetailSection title="Customer">
      <div className={orderSectionStack}>
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-violet-500/15 text-xs font-semibold text-violet-200">
            {initials(name)}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className={`${orderClamp2} ${orderLongText} platform-type-section-title font-semibold text-[var(--platform-text-primary)]`}>{name}</p>
            {text(order.customer_email) ? (
              <Link
                href={`/admin/users?q=${encodeURIComponent(text(order.customer_email))}`}
                className={`block platform-type-body text-violet-300 hover:underline ${orderTruncateEllipsis}`}
                title={text(order.customer_email)}
              >
                {text(order.customer_email)}
              </Link>
            ) : (
              <p className="platform-type-caption">No email</p>
            )}
          </div>
        </div>

        <OrderFieldGrid columns={2}>
          <OrderField label="Phone" value={orderPhone(order) || "—"} truncate />
          {text(metadata.customer_company) ? (
            <OrderField label="Company" value={text(metadata.customer_company)} truncate />
          ) : null}
        </OrderFieldGrid>

        {text(metadata.customer_note) || text(metadata.enquiry_message) ? (
          <div className={`border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] ${orderNestedCardPad} ${orderRadiusControl} platform-type-body leading-relaxed text-[var(--platform-text-secondary)] ${orderLongText}`}>
            {text(metadata.customer_note) ? <p>Note: {text(metadata.customer_note)}</p> : null}
            {text(metadata.enquiry_message) ? <p className="mt-2">Enquiry: {text(metadata.enquiry_message)}</p> : null}
          </div>
        ) : null}

        {prior.length ? (
          <div>
            <p className="platform-type-caption font-semibold text-[var(--platform-text-muted)]">
              Previous orders ({prior.length})
            </p>
            <ul className="mt-2 space-y-1">
              {prior.map((priorOrder) => {
                const label = publicOrderLabel(priorOrder);
                const selectionKey = orderSelectionKey(priorOrder);
                const href = buildOrdersUrl({
                  queue,
                  order: selectionKey,
                  q: filtersQuery || undefined
                });
                return (
                  <li key={text(priorOrder.id)}>
                    {onSelectOrder ? (
                      <button
                        type="button"
                        onClick={() => onSelectOrder(selectionKey)}
                        className="platform-type-body text-violet-300 hover:underline"
                      >
                        {label} · {text(priorOrder.status)}
                      </button>
                    ) : (
                      <Link href={href} className="platform-type-body text-violet-300 hover:underline">
                        {label} · {text(priorOrder.status)}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </OrderDetailSection>
  );
}
