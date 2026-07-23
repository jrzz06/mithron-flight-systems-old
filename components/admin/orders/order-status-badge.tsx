"use client";

import {
  Archive,
  Ban,
  CheckCircle2,
  Clock3,
  CreditCard,
  Package,
  ShieldCheck,
  Truck,
  Warehouse
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { humanStatus } from "@/lib/platform/copy";
import { orderRadiusControl } from "@/components/admin/orders/order-layout-utils";

type StatusTone = {
  icon: LucideIcon;
  surface: string;
  text: string;
};

function resolveStatusTone(status: string): StatusTone {
  const normalized = status.toLowerCase();

  if (/(archived)/.test(normalized)) {
    return { icon: Archive, surface: "bg-zinc-500/10 border-zinc-500/30", text: "text-zinc-300" };
  }
  if (/(cancelled|failed|rejected|denied)/.test(normalized)) {
    return { icon: Ban, surface: "bg-rose-500/10 border-rose-500/30", text: "text-rose-200" };
  }
  if (/(delivered)/.test(normalized)) {
    return { icon: CheckCircle2, surface: "bg-emerald-500/10 border-emerald-500/30", text: "text-emerald-200" };
  }
  if (/(dispatched|shipped|ready_to_dispatch)/.test(normalized)) {
    return { icon: Truck, surface: "bg-cyan-500/10 border-cyan-500/30", text: "text-cyan-200" };
  }
  if (/(assigned|warehouse|picked|packed|packing|processing)/.test(normalized)) {
    return { icon: Warehouse, surface: "bg-blue-500/10 border-blue-500/30", text: "text-blue-200" };
  }
  if (/(verified|succeeded|paid|confirmed)/.test(normalized)) {
    return { icon: ShieldCheck, surface: "bg-emerald-500/10 border-emerald-500/30", text: "text-emerald-200" };
  }
  if (/(admin_review|review)/.test(normalized)) {
    return { icon: Clock3, surface: "bg-amber-500/10 border-amber-500/30", text: "text-amber-200" };
  }
  if (/(pending|processing|requires_payment)/.test(normalized)) {
    return { icon: Clock3, surface: "bg-amber-500/10 border-amber-500/30", text: "text-amber-200" };
  }
  if (/(payment|not_required)/.test(normalized)) {
    return { icon: CreditCard, surface: "bg-violet-500/10 border-violet-500/30", text: "text-violet-200" };
  }

  return { icon: Package, surface: "bg-[var(--platform-surface-muted)] border-[var(--platform-border)]", text: "text-[var(--platform-text-secondary)]" };
}

type OrderStatusBadgeProps = {
  status: string;
  /** Override auto-derived humanStatus(status) text (e.g. payment/fulfillment labels). */
  label?: string;
  compact?: boolean;
  className?: string;
};

export function OrderStatusBadge({ status, label: labelOverride, compact = false, className = "" }: OrderStatusBadgeProps) {
  const label = labelOverride || humanStatus(status) || status.replaceAll("_", " ");
  if (!label) return null;

  const tone = resolveStatusTone(status);
  const Icon = tone.icon;

  return (
    <span
      aria-label={`Status: ${label}`}
      title={label}
      className={`inline-flex h-6 max-w-full items-center gap-1.5 whitespace-nowrap border px-2.5 text-xs font-medium ${orderRadiusControl} ${tone.surface} ${tone.text} ${
        compact ? "type-badge" : ""
      } ${className}`}
    >
      <Icon className={compact ? "h-3 w-3 shrink-0" : "h-3.5 w-3.5 shrink-0"} aria-hidden />
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}

