"use client";

import { useState, type ReactNode } from "react";
import { Copy } from "lucide-react";
import { OrderStatusBadge } from "@/components/admin/orders/order-status-badge";
import {
  orderCardPad,
  orderCardStack,
  orderLongText,
  orderRadiusCard,
  orderRadiusControl,
  orderSectionLabel,
  orderTruncateEllipsis
} from "@/components/admin/orders/order-layout-utils";
import {
  assignedWarehouseCode,
  moneyText,
  nextStepForOrder,
  orderPriorityBadge,
  publicOrderLabel,
  text,
  type AdminRow
} from "@/components/admin/orders/order-view-helpers";

export function orderPanelEnterClass(reducedMotion: boolean, visible: boolean) {
  if (reducedMotion) return "opacity-100";
  return visible
    ? "translate-x-0 opacity-100 transition-all duration-[220ms] ease-out"
    : "translate-x-2 opacity-0 transition-all duration-[220ms] ease-out";
}

export function orderContentSwapClass(reducedMotion: boolean) {
  return reducedMotion ? "" : "transition-opacity duration-[220ms] ease-out";
}

export function orderHoverClass() {
  return "transition-colors duration-150";
}

type OrderDetailShellProps = {
  children: ReactNode;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  header?: ReactNode;
};

export function OrderDetailShell({ children, scrollRef, header }: OrderDetailShellProps) {
  return (
    <div
      data-order-detail-panel
      className={`flex min-h-0 min-w-0 flex-col border border-[var(--platform-border)] bg-[var(--platform-surface)] shadow-sm ${orderRadiusCard}`}
    >
      {header ? <div className="shrink-0 border-b border-[var(--platform-border)] px-4 py-3 lg:hidden">{header}</div> : null}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4"
      >
        <div className={orderCardStack}>{children}</div>
      </div>
    </div>
  );
}

type OrderDetailCardProps = {
  title: string;
  children: ReactNode;
  className?: string;
  hero?: boolean;
  dataAttribute?: string;
};

export function OrderDetailCard({
  title,
  children,
  className = "",
  hero: _hero = false,
  dataAttribute
}: OrderDetailCardProps) {
  return (
    <section
      {...(dataAttribute ? { [dataAttribute]: true } : {})}
      className={`@container min-w-0 border border-[var(--platform-border)] bg-[var(--platform-surface)] shadow-sm ${orderRadiusCard} ${orderCardPad} ${className}`}
    >
      <h3 className={orderSectionLabel}>{title}</h3>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

type OrderStickyHeaderProps = {
  order: AdminRow;
  defaultWarehouseCode: string;
};

/** Compact sticky strip so order id, total, and next step stay visible while scrolling. */
export function OrderStickyHeader({ order, defaultWarehouseCode }: OrderStickyHeaderProps) {
  const nextStep = nextStepForOrder(order);
  return (
    <div className="sticky top-0 z-20 -mx-4 mb-2 border-b border-[var(--platform-border)] bg-[var(--platform-surface)]/95 px-4 py-2 backdrop-blur-sm">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <OrderIdText value={publicOrderLabel(order)} heading showCopy />
            <p className="shrink-0 text-xl font-bold text-[var(--platform-text-primary)]">{moneyText(order.total)}</p>
          </div>
          <OrderStatusStrip order={order} defaultWarehouseCode={defaultWarehouseCode} />
        </div>
        {nextStep.button ? (
          <p className={`shrink-0 border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-200 ${orderRadiusControl}`}>
            Next: {nextStep.button}
          </p>
        ) : null}
      </div>
    </div>
  );
}

type OrderDetailSectionProps = {
  title: string;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  className?: string;
  dataAttribute?: string;
};

export function OrderDetailSection({
  title,
  children,
  collapsible = false,
  defaultOpen = true,
  className = "",
  dataAttribute
}: OrderDetailSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (!collapsible) {
    return (
      <OrderDetailCard title={title} className={className} dataAttribute={dataAttribute}>
        {children}
      </OrderDetailCard>
    );
  }

  return (
    <section
      {...(dataAttribute ? { [dataAttribute]: true } : {})}
      className={`@container min-w-0 border border-[var(--platform-border)] bg-[var(--platform-surface)] shadow-sm ${orderRadiusCard} ${orderCardPad} ${className}`}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="sticky top-0 z-10 flex w-full items-center justify-between bg-[var(--platform-surface)] py-1 text-left"
        aria-expanded={open}
      >
        <h3 className={orderSectionLabel}>{title}</h3>
        <span className="text-xs text-[var(--platform-text-muted)]">{open ? "−" : "+"}</span>
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-[220ms] ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="min-w-0 overflow-hidden">
          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </section>
  );
}

export function OrderFieldGrid({ children, columns = 1 }: { children: ReactNode; columns?: 1 | 2 }) {
  return (
    <dl className={`grid min-w-0 gap-2 ${columns === 2 ? "@sm:grid-cols-2" : ""}`}>{children}</dl>
  );
}

export function OrderField({
  label,
  value,
  truncate = false
}: {
  label: string;
  value: ReactNode;
  /** Single-line fields (email, phone) use ellipsis + title tooltip. */
  truncate?: boolean;
}) {
  const valueClass = truncate ? orderTruncateEllipsis : orderLongText;
  const title =
    truncate && (typeof value === "string" || typeof value === "number") ? String(value) : undefined;

  return (
    <div className="grid min-w-0 gap-1 @xs:grid-cols-[minmax(5.5rem,40%)_minmax(0,1fr)] @xs:items-start @xs:gap-x-3 @xs:gap-y-1">
      <dt className="min-w-0 text-xs text-[var(--platform-text-muted)]">{label}</dt>
      <dd
        className={`min-w-0 text-sm font-medium text-[var(--platform-text-primary)] ${valueClass}`}
        title={title}
      >
        {value}
      </dd>
    </div>
  );
}

type OrderIdTextProps = {
  value: string;
  className?: string;
  heading?: boolean;
  showCopy?: boolean;
};

export function OrderIdText({ value, className = "", heading = false, showCopy = true }: OrderIdTextProps) {
  const [copied, setCopied] = useState(false);
  const Tag = heading ? "h2" : "span";

  async function copyId() {
    if (!value || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard failures
    }
  }

  return (
    <span className={`inline-flex min-w-0 max-w-full items-start gap-2 ${className}`}>
      <Tag
        className={`${orderTruncateEllipsis} ${heading ? "platform-type-page-title font-bold text-[var(--platform-text-primary)]" : "text-base font-bold leading-snug text-[var(--platform-text-primary)]"}`}
        title={value}
      >
        {value}
      </Tag>
      {showCopy && value ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void copyId();
          }}
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center border border-[var(--platform-border)] text-[var(--platform-text-muted)] hover:bg-[var(--platform-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 ${orderRadiusControl}`}
          aria-label={copied ? "Copied order ID" : "Copy order ID"}
          title={copied ? "Copied" : "Copy order ID"}
        >
          <Copy className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
    </span>
  );
}

function priorityLabel(priority: ReturnType<typeof orderPriorityBadge>) {
  if (priority === "urgent") return { label: "Enquiry", className: "border-amber-500/30 bg-amber-500/10 text-amber-200" };
  if (priority === "action") return { label: "Action", className: "border-violet-500/30 bg-violet-500/10 text-violet-200" };
  if (priority === "payment") return { label: "Unpaid", className: "border-rose-500/30 bg-rose-500/10 text-rose-200" };
  return null;
}

type OrderStatusStripProps = {
  order: AdminRow;
  defaultWarehouseCode: string;
};

export function OrderStatusStrip({ order, defaultWarehouseCode }: OrderStatusStripProps) {
  const hasInvoice = Boolean(text(order.invoice_url));
  const invoiceStatus = hasInvoice ? "generated" : text(order.payment_status) === "succeeded" ? "pending" : "not_required";
  const warehouse = assignedWarehouseCode(order, defaultWarehouseCode);
  const priority = priorityLabel(orderPriorityBadge(order));

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <OrderStatusBadge status={text(order.status, "pending")} />
      <OrderStatusBadge status={text(order.payment_status, "not_required")} />
      <OrderStatusBadge status={text(order.fulfillment_status, "pending")} />
      <span className={`inline-flex h-6 max-w-full items-center whitespace-nowrap border border-[var(--platform-border)] px-2.5 text-xs text-[var(--platform-text-secondary)] ${orderRadiusControl}`}>
        Invoice: {invoiceStatus.replaceAll("_", " ")}
      </span>
      <span className={`inline-flex h-6 max-w-full items-center whitespace-nowrap border border-[var(--platform-border)] px-2.5 text-xs text-[var(--platform-text-secondary)] ${orderRadiusControl}`}>
        WH {warehouse}
      </span>
      {priority ? (
        <span className={`inline-flex h-6 max-w-full items-center whitespace-nowrap border px-2.5 text-xs font-medium ${orderRadiusControl} ${priority.className}`}>
          {priority.label}
        </span>
      ) : null}
    </div>
  );
}

export function OrderStockBadge({
  available,
  className = ""
}: {
  available: number;
  className?: string;
}) {
  if (available <= 0) {
    return (
      <span className={`inline-flex h-6 max-w-full items-center whitespace-nowrap border border-rose-500/30 bg-rose-500/10 px-2.5 text-xs font-medium text-rose-200 ${orderRadiusControl} ${className}`}>
        Out of stock
      </span>
    );
  }
  if (available <= 5) {
    return (
      <span className={`inline-flex h-6 max-w-full items-center whitespace-nowrap border border-amber-500/30 bg-amber-500/10 px-2.5 text-xs font-medium text-amber-200 ${orderRadiusControl} ${className}`}>
        Low stock
      </span>
    );
  }
  return (
    <span className={`inline-flex h-6 max-w-full items-center whitespace-nowrap border border-emerald-500/30 bg-emerald-500/10 px-2.5 text-xs font-medium text-emerald-200 ${orderRadiusControl} ${className}`}>
      In stock
    </span>
  );
}

export function ActionGroup({
  title,
  children,
  danger = false,
  collapsible = false,
  defaultOpen = true
}: {
  title: string;
  children: ReactNode;
  danger?: boolean;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (!collapsible) {
    return (
      <div className={`grid min-w-0 gap-2 ${danger ? `border border-rose-500/20 bg-rose-950/10 p-4 ${orderRadiusControl}` : ""}`}>
        <p className={orderSectionLabel}>{title}</p>
        <div className="grid gap-2">{children}</div>
      </div>
    );
  }

  return (
    <div
      className={`grid min-w-0 gap-2 ${danger ? `border border-rose-500/20 bg-rose-950/10 p-4 ${orderRadiusControl}` : ""}`}
      data-action-group-collapsible={title}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full min-w-0 items-center justify-between text-left"
        aria-expanded={open}
      >
        <p className={`${orderSectionLabel} mb-0`}>{title}</p>
        <span className="text-xs text-[var(--platform-text-muted)]">{open ? "−" : "+"}</span>
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-[220ms] ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="min-w-0 overflow-hidden">
          <div className="grid gap-2">{children}</div>
        </div>
      </div>
    </div>
  );
}
