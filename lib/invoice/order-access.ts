import "server-only";

import { requireClientAuditToken } from "@/lib/api/require-client-audit-token";
import { fetchAdminRecordsByColumn } from "@/services/admin-actions";

export async function assertInvoiceOrderAccess(input: {
  orderId: string;
  userId: string | null;
  email?: string;
  request?: Request;
  allowStaff?: boolean;
}) {
  const orders = await fetchAdminRecordsByColumn("orders", "id", input.orderId);
  const order = orders[0];
  if (!order) {
    return { ok: false as const, status: 404, error: "Order not found." };
  }

  if (input.userId) {
    const ownerId = typeof order.created_by_user_id === "string" ? order.created_by_user_id : null;
    if (ownerId === input.userId || input.allowStaff) {
      return { ok: true as const, order };
    }
    return { ok: false as const, status: 404, error: "Order not found." };
  }

  if (!input.request) {
    return { ok: false as const, status: 401, error: "Authentication required." };
  }

  const audit = requireClientAuditToken(input.request);
  if (!audit.ok) {
    return { ok: false as const, status: 401, error: audit.error };
  }

  const orderEmail = String(order.customer_email ?? "").trim().toLowerCase();
  const requestEmail = input.email?.trim().toLowerCase() ?? "";
  if (!requestEmail || orderEmail !== requestEmail) {
    return { ok: false as const, status: 403, error: "Email does not match order." };
  }

  return { ok: true as const, order };
}
