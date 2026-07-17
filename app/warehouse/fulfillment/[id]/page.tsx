import { notFound, redirect } from "next/navigation";
import { ControlShell } from "@/components/admin/control-shell";
import { OperationalFeedback } from "@/components/admin/module-panel";
import { Breadcrumb } from "@/components/platform/breadcrumb";
import { WarehouseFulfillmentDetail } from "@/components/warehouse/warehouse-fulfillment-detail";
import { WarehouseOpsLiveSync } from "@/components/warehouse/warehouse-ops-live-sync";
import { OrderNotificationsReadOnView } from "@/components/notifications/order-notifications-read-on-view";
import { isActionNavigationError } from "@/lib/server-action-errors";
import { employeeFulfillmentLabel } from "@/lib/warehouse/operational-labels";
import {
  buildWarehouseOrderRow,
  type WarehouseOrderRow
} from "@/lib/warehouse/order-helpers";
import { getWarehouseSnapshot } from "@/services/admin";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";
import {
  cancelWarehouseOrderFormAction,
  dispatchWarehouseOrderFormAction
} from "../../actions";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function searchValue(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function feedbackPath(orderId: string, status: "success" | "error", message: string) {
  return `/warehouse/fulfillment/${orderId}?operation_status=${status}&operation_message=${encodeURIComponent(message)}`;
}

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : "The order action failed.";
}

async function dispatchOrderWithFeedback(formData: FormData) {
  "use server";
  const orderId = String(formData.get("order_id") ?? "");
  try {
    await dispatchWarehouseOrderFormAction(formData);
  } catch (error) {
    if (isActionNavigationError(error)) throw error;
    redirect(feedbackPath(orderId, "error", messageFromError(error)));
  }
  redirect(feedbackPath(orderId, "success", "Order dispatched."));
}

async function cancelOrderWithFeedback(formData: FormData) {
  "use server";
  const orderId = String(formData.get("order_id") ?? "");
  try {
    await cancelWarehouseOrderFormAction(formData);
  } catch (error) {
    if (isActionNavigationError(error)) throw error;
    redirect(feedbackPath(orderId, "error", messageFromError(error)));
  }
  redirect(`/warehouse/orders?operation_status=success&operation_message=${encodeURIComponent("Order cancelled.")}`);
}

function firstImageFrom(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return firstImageFrom(record.src ?? record.url ?? record.image);
  }
  return null;
}

export default async function WarehouseFulfillmentDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const [snapshot, policy] = await Promise.all([
    getWarehouseSnapshot({ scope: "orders" }),
    getAdminSettingsPolicy()
  ]);
  const defaultWarehouseCode = policy.defaultWarehouseCode;
  const order = snapshot.data.orders.find((row) => String(row.id ?? "") === id);
  if (!order) notFound();

  const query = searchParams ? await searchParams : {};
  const operationStatus = searchValue(query, "operation_status");
  const operationMessage = searchValue(query, "operation_message");

  const itemsByOrder = snapshot.data.orderItems.filter((item) => String(item.order_id ?? "") === id);
  const productsBySlug = new Map(snapshot.data.products.map((product) => [String(product.slug ?? ""), product]));

  const metadata = order.metadata && typeof order.metadata === "object" && !Array.isArray(order.metadata)
    ? order.metadata as Record<string, unknown>
    : {};
  const warehouseCode = String(metadata.assigned_warehouse_code ?? defaultWarehouseCode);

  const orderRow: WarehouseOrderRow = buildWarehouseOrderRow(order, {
    itemCount: itemsByOrder.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0),
    defaultWarehouseCode
  });

  const itemRows = itemsByOrder.map((item) => {
    const productSlug = String(item.product_slug ?? "");
    const sku = String(item.sku ?? "");
    const product = productsBySlug.get(productSlug);
    return {
      id: String(item.id ?? `${productSlug}-${sku}`),
      productName: String(item.product_name ?? product?.name ?? productSlug),
      productSlug,
      sku,
      quantity: Number(item.quantity ?? 0),
      image: firstImageFrom(product?.image) ?? firstImageFrom(product?.hero),
      warehouseLocation: warehouseCode
    };
  });

  return (
    <>
      <WarehouseOpsLiveSync />
      <OrderNotificationsReadOnView orderId={id} />
      <Breadcrumb items={[
        { label: "Fulfillment", href: "/warehouse/fulfillment" },
        { label: orderRow.orderNumber }
      ]} />
      <ControlShell
        eyebrow="Fulfillment"
        title={orderRow.orderNumber}
        description={`${employeeFulfillmentLabel(orderRow.fulfillmentStatus)} · review products and dispatch`}
        actions={[
          { label: "Fulfillment", href: "/warehouse/fulfillment" },
          { label: "Orders", href: "/warehouse/orders" }
        ]}
      >
        <OperationalFeedback
          status={operationStatus}
          message={operationMessage}
          context="Fulfillment"
          idle="Fulfillment action results appear here."
        />
        <WarehouseFulfillmentDetail
          order={order}
          orderRow={orderRow}
          items={itemRows}
          dispatchAction={dispatchOrderWithFeedback}
          cancelAction={cancelOrderWithFeedback}
        />
      </ControlShell>
    </>
  );
}
