"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { revalidateAfterMutation, revalidateWarehouseSnapshotCache } from "@/lib/control-plane/revalidate-realtime";
import {
  adminOrderActionFromError,
  adminOrderActionSuccess,
  type AdminOrderActionResult
} from "@/lib/admin/order-action-result";
import { actionErrorMessage, isNextRedirect } from "@/lib/server-action-feedback";
import { AdminRecordConflictError } from "@/services/admin-actions";
import { requireAdminPermission } from "@/services/auth";
import { buildManualOrderInputFromFormData, buildAddOrderItemsFromFormData, buildOrderShippingAddressUpdateFromFormData } from "@/services/enterprise-admin-forms";
import { createAdminManualOrderWorkflow } from "@/services/manual-order";
import {
  addOrderItemsToOrderWorkflow,
  assignOrderToWarehouseWorkflow,
  cancelAdminOrderWorkflow,
  confirmAdminOrderWorkflow,
  deleteAdminOrderWorkflow,
  markOrderPaidWorkflow,
  markOrderRefundedWorkflow,
  permanentDeleteAdminOrderWorkflow,
  rejectAdminOrderWorkflow,
  removeOrderItemFromOrderWorkflow,
  updateOrderShippingAddressWorkflow
} from "@/services/order-workflow";

async function revalidateAdminOrderSurfaces(...extraPaths: string[]) {
  await revalidateWarehouseSnapshotCache();
  revalidatePath("/admin/orders");
  revalidatePath("/warehouse/orders");
  for (const path of extraPaths) {
    revalidatePath(path);
  }
  await revalidateAfterMutation("orders", "order_items");
}

function redirectOrderActionError(formData: FormData, message: string): never {
  const orderId = String(formData.get("order_id") ?? "").trim();
  const queue = String(formData.get("queue") ?? "review");
  const query = String(formData.get("q") ?? "");
  const params = new URLSearchParams();
  if (orderId) params.set("order", orderId);
  if (queue) params.set("queue", queue);
  if (query) params.set("q", query);
  params.set("order_status", "error");
  params.set("order_message", message);
  redirect(`/admin/orders?${params.toString()}`);
}

async function runAdminOrderAction(formData: FormData, action: () => Promise<void>): Promise<AdminOrderActionResult> {
  try {
    await action();
    return adminOrderActionSuccess();
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    if (error instanceof AdminRecordConflictError) {
      return adminOrderActionFromError(error);
    }
    redirectOrderActionError(formData, actionErrorMessage(error));
  }
}

export async function createAdminManualOrderFormAction(formData: FormData) {
  try {
    const context = await requireAdminPermission("orders.write");
    const input = buildManualOrderInputFromFormData(formData);
    const result = await createAdminManualOrderWorkflow(input, context.userId!);

    await revalidateAdminOrderSurfaces();

    const params = new URLSearchParams({
      order: result.orderNumber,
      queue: "confirmed",
      order_status: "success",
      order_message: `Order ${result.orderNumber} created.`
    });
    redirect(`/admin/orders?${params.toString()}`);
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirectOrderActionError(formData, actionErrorMessage(error));
  }
}

export async function confirmPaidOrderFormAction(formData: FormData): Promise<AdminOrderActionResult> {
  return runAdminOrderAction(formData, async () => {
    const context = await requireAdminPermission("orders.write");
    const orderId = String(formData.get("order_id") ?? "").trim();
    if (!orderId) throw new Error("Order id is required.");

    const expectedUpdatedAt = String(formData.get("expected_updated_at") ?? "").trim() || null;
    await confirmAdminOrderWorkflow({
      orderId,
      actorId: context.userId!,
      expectedUpdatedAt
    });
    await revalidateAdminOrderSurfaces();
  });
}

export async function markOrderPaidFormAction(formData: FormData): Promise<AdminOrderActionResult> {
  return runAdminOrderAction(formData, async () => {
    const context = await requireAdminPermission("orders.write");
    const orderId = String(formData.get("order_id") ?? "").trim();
    if (!orderId) throw new Error("Order id is required.");

    const expectedUpdatedAt = String(formData.get("expected_updated_at") ?? "").trim() || null;
    const note = String(formData.get("note") ?? "").trim() || undefined;

    await markOrderPaidWorkflow({
      orderId,
      actorId: context.userId!,
      note,
      expectedUpdatedAt
    });

    await revalidateAdminOrderSurfaces();
  });
}

export async function markOrderRefundedFormAction(formData: FormData): Promise<AdminOrderActionResult> {
  return runAdminOrderAction(formData, async () => {
    const context = await requireAdminPermission("orders.write");
    const orderId = String(formData.get("order_id") ?? "").trim();
    if (!orderId) throw new Error("Order id is required.");

    const expectedUpdatedAt = String(formData.get("expected_updated_at") ?? "").trim() || null;
    const note = String(formData.get("note") ?? "").trim() || undefined;

    await markOrderRefundedWorkflow({
      orderId,
      actorId: context.userId!,
      note,
      expectedUpdatedAt
    });

    await revalidateAdminOrderSurfaces();
  });
}

export async function rejectAdminOrderFormAction(formData: FormData): Promise<AdminOrderActionResult> {
  return runAdminOrderAction(formData, async () => {
    const context = await requireAdminPermission("orders.write");
    const orderId = String(formData.get("order_id") ?? "").trim();
    const reason = String(formData.get("reject_reason") ?? "").trim();
    if (!orderId) throw new Error("Order id is required.");

    const expectedUpdatedAt = String(formData.get("expected_updated_at") ?? "").trim() || null;
    await rejectAdminOrderWorkflow({
      orderId,
      actorId: context.userId!,
      reason: reason || undefined,
      expectedUpdatedAt
    });
    await revalidateAdminOrderSurfaces("/admin/enquiries");
  });
}

export async function assignOrderToWarehouseFormAction(formData: FormData): Promise<AdminOrderActionResult> {
  return runAdminOrderAction(formData, async () => {
    const context = await requireAdminPermission("orders.write");
    const orderId = String(formData.get("order_id") ?? "").trim();
    const warehouseCode = String(formData.get("warehouse_code") ?? "").trim() || undefined;
    if (!orderId) throw new Error("Order id is required.");

    const expectedUpdatedAt = String(formData.get("expected_updated_at") ?? "").trim() || null;
    await assignOrderToWarehouseWorkflow({
      orderId,
      actorId: context.userId!,
      warehouseCode,
      expectedUpdatedAt
    });
    await revalidateAdminOrderSurfaces("/warehouse/dashboard");
  });
}

export async function cancelAdminOrderFormAction(formData: FormData): Promise<AdminOrderActionResult> {
  return runAdminOrderAction(formData, async () => {
    const context = await requireAdminPermission("orders.write");
    const orderId = String(formData.get("order_id") ?? "").trim();
    const reason = String(formData.get("cancel_reason") ?? "").trim();
    if (!orderId) throw new Error("Order id is required.");
    if (!reason) throw new Error("A cancellation reason is required.");

    const expectedUpdatedAt = String(formData.get("expected_updated_at") ?? "").trim() || null;
    await cancelAdminOrderWorkflow({
      orderId,
      actorId: context.userId!,
      reason,
      expectedUpdatedAt
    });
    await revalidateAdminOrderSurfaces("/admin/enquiries");
  });
}

export async function deleteAdminOrderFormAction(formData: FormData) {
  await runAdminOrderAction(formData, async () => {
    const context = await requireAdminPermission("orders.write");
    const orderId = String(formData.get("order_id") ?? "").trim();
    const reason = String(formData.get("delete_reason") ?? "").trim();
    if (!orderId) throw new Error("Order id is required.");
    if (!reason) throw new Error("A deletion reason is required.");

    await deleteAdminOrderWorkflow({
      orderId,
      actorId: context.userId!,
      reason
    });
    await revalidateAdminOrderSurfaces("/admin/enquiries");
  });
}

export async function permanentDeleteAdminOrderFormAction(formData: FormData) {
  await runAdminOrderAction(formData, async () => {
    const context = await requireAdminPermission("orders.permanent_delete");
    const orderId = String(formData.get("order_id") ?? "").trim();
    const reason = String(formData.get("delete_reason") ?? "").trim();
    if (!orderId) throw new Error("Order id is required.");
    if (!reason) throw new Error("A deletion reason is required.");

    await permanentDeleteAdminOrderWorkflow({
      orderId,
      actorId: context.userId!,
      reason,
      expectedUpdatedAt: String(formData.get("expected_updated_at") ?? "").trim() || null
    });
    await revalidateAdminOrderSurfaces("/admin/enquiries");
  });
}

export async function updateOrderShippingAddressFormAction(formData: FormData): Promise<AdminOrderActionResult> {
  return runAdminOrderAction(formData, async () => {
    const context = await requireAdminPermission("orders.write");
    const payload = buildOrderShippingAddressUpdateFromFormData(formData);
    await updateOrderShippingAddressWorkflow({
      orderId: payload.orderId,
      actorId: context.userId!,
      shipping: payload.shipping,
      billingSameAsShipping: payload.billingSameAsShipping,
      billing: payload.billing,
      expectedUpdatedAt: payload.expectedUpdatedAt
    });
    await revalidateAdminOrderSurfaces();
  });
}

export async function addOrderItemsFormAction(formData: FormData): Promise<AdminOrderActionResult> {
  return runAdminOrderAction(formData, async () => {
    const context = await requireAdminPermission("orders.write");
    const payload = buildAddOrderItemsFromFormData(formData);
    await addOrderItemsToOrderWorkflow({
      orderId: payload.orderId,
      actorId: context.userId!,
      items: payload.items,
      expectedUpdatedAt: payload.expectedUpdatedAt
    });
    await revalidateAdminOrderSurfaces();
  });
}

export async function removeOrderItemFormAction(formData: FormData): Promise<AdminOrderActionResult> {
  return runAdminOrderAction(formData, async () => {
    const context = await requireAdminPermission("orders.write");
    const orderId = String(formData.get("order_id") ?? "").trim();
    const orderItemId = String(formData.get("order_item_id") ?? "").trim();
    const reason = String(formData.get("remove_reason") ?? "").trim() || undefined;
    const expectedUpdatedAt = String(formData.get("expected_updated_at") ?? "").trim() || null;
    if (!orderId) throw new Error("Order id is required.");
    if (!orderItemId) throw new Error("Order line item id is required.");

    await removeOrderItemFromOrderWorkflow({
      orderId,
      orderItemId,
      actorId: context.userId!,
      reason,
      expectedUpdatedAt
    });
    await revalidateAdminOrderSurfaces();
  });
}
