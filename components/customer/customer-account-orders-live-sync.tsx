"use client";

import { useControlPlaneLiveSync } from "@/components/control-plane/use-control-plane-live-sync";

const CUSTOMER_ORDER_TABLES = new Set(["orders", "order_items", "payments", "notifications"]);

function shouldRefreshCustomerOrders(table: string) {
  return CUSTOMER_ORDER_TABLES.has(table);
}

export function CustomerAccountOrdersLiveSync({ enabled = true }: { enabled?: boolean }) {
  useControlPlaneLiveSync("customer", shouldRefreshCustomerOrders, enabled);

  if (!enabled) return null;

  return <div data-customer-orders-live-sync className="sr-only" aria-hidden="true" />;
}
