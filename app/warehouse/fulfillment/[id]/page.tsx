import { notFound, redirect } from "next/navigation";
import { ControlShell } from "@/components/admin/control-shell";
import { OperationalFeedback } from "@/components/admin/module-panel";
import { Breadcrumb } from "@/components/platform/breadcrumb";
import { WarehouseFulfillmentDetail } from "@/components/warehouse/warehouse-fulfillment-detail";
import { WarehouseOpsLiveSync } from "@/components/warehouse/warehouse-ops-live-sync";
import { OrderNotificationsReadOnView } from "@/components/notifications/order-notifications-read-on-view";
import { isActionNavigationError } from "@/lib/server-action-errors";
import {
  buildWarehouseOrderRow,
  type WarehouseOrderRow
} from "@/lib/warehouse/order-helpers";
import { loadWarehouseOrderDetail } from "@/services/admin";
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
  redirect(`/warehouse/activity?operation_status=success&operation_message=${encodeURIComponent("Order dispatched.")}`);
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
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = firstImageFrom(entry);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return firstImageFrom(
      record.src
      ?? record.url
      ?? record.image
      ?? record.public_url
      ?? record.hero
      ?? record.thumbnail
    );
  }
  return null;
}

function collectImageUrls(...sources: unknown[]): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  function push(url: string | null) {
    if (!url || seen.has(url)) return;
    seen.add(url);
    urls.push(url);
  }

  function walk(value: unknown) {
    if (!value) return;
    if (typeof value === "string") {
      push(value.trim() || null);
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) walk(entry);
      return;
    }
    if (typeof value === "object") {
      const record = value as Record<string, unknown>;
      push(firstImageFrom(record));
      if (Array.isArray(record.images)) walk(record.images);
      if (Array.isArray(record.gallery)) walk(record.gallery);
    }
  }

  for (const source of sources) walk(source);
  return urls;
}

function variantFromMeta(meta: Record<string, unknown> | null) {
  if (!meta) return "";
  const raw = meta.variant_label ?? meta.variant_name ?? meta.variant ?? meta.option_label;
  return typeof raw === "string" && raw.trim() ? raw.trim() : "";
}

export default async function WarehouseFulfillmentDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const [detail, policy] = await Promise.all([
    loadWarehouseOrderDetail(id),
    getAdminSettingsPolicy()
  ]);
  const defaultWarehouseCode = policy.defaultWarehouseCode;
  const order = detail.data.order;
  if (!order) notFound();

  const query = searchParams ? await searchParams : {};
  const operationStatus = searchValue(query, "operation_status");
  const operationMessage = searchValue(query, "operation_message");

  const itemsByOrder = detail.data.orderItems;
  const productsBySlug = new Map(detail.data.products.map((product) => [String(product.slug ?? ""), product]));

  const orderRow: WarehouseOrderRow = buildWarehouseOrderRow(order, {
    itemCount: itemsByOrder.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0),
    defaultWarehouseCode
  });

  const itemRows = itemsByOrder.map((item) => {
    const productSlug = String(item.product_slug ?? "");
    const sku = String(item.sku ?? "");
    const product = productsBySlug.get(productSlug);
    const lineTotalRaw = item.line_total;
    const lineTotal =
      lineTotalRaw != null && String(lineTotalRaw).trim()
        ? String(lineTotalRaw)
        : "—";
    const itemMeta = item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
      ? item.metadata as Record<string, unknown>
      : null;
    const images = collectImageUrls(
      itemMeta?.image,
      itemMeta?.product_image,
      itemMeta?.thumbnail,
      itemMeta?.images,
      product?.image,
      product?.hero
    );
    return {
      id: String(item.id ?? `${productSlug}-${sku}`),
      productName: String(item.product_name ?? product?.name ?? productSlug),
      productSlug,
      sku,
      variantLabel: variantFromMeta(itemMeta),
      quantity: Number(item.quantity ?? 0),
      lineTotal,
      image: images[0] ?? null,
      imageCount: Math.max(images.length, images[0] ? 1 : 0)
    };
  });

  const hasFeedback = Boolean(operationStatus && operationMessage);

  return (
    <>
      <WarehouseOpsLiveSync />
      <OrderNotificationsReadOnView orderId={id} />
      <Breadcrumb items={[
        { label: "Orders", href: "/warehouse/orders" },
        { label: orderRow.orderNumber }
      ]} />
      <ControlShell
        eyebrow="Fulfillment"
        title={orderRow.orderNumber}
        description="Order details — customer, products, payment, and dispatch"
        actions={[
          { label: "Orders", href: "/warehouse/orders" },
          { label: "History", href: "/warehouse/activity" }
        ]}
      >
        {hasFeedback ? (
          <div className="mb-3">
            <OperationalFeedback
              status={operationStatus}
              message={operationMessage}
              context="Fulfillment"
            />
          </div>
        ) : null}
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
