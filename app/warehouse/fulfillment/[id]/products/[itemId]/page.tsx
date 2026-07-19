import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ControlShell } from "@/components/admin/control-shell";
import { OperationalFeedback } from "@/components/admin/module-panel";
import {
  OperationalPrimaryAction
} from "@/components/admin/operational-action-panel";
import { Breadcrumb } from "@/components/platform/breadcrumb";
import { WarehouseOpsLiveSync } from "@/components/warehouse/warehouse-ops-live-sync";
import { isActionNavigationError } from "@/lib/server-action-errors";
import { employeeFulfillmentLabel } from "@/lib/warehouse/operational-labels";
import {
  canDispatchOrder,
  orderMetadata,
  warehouseCustomerEmail,
  warehouseCustomerName,
  warehouseCustomerPhone,
  warehouseShippingAddress
} from "@/lib/warehouse/order-helpers";
import { loadWarehouseOrderDetail } from "@/services/admin";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";
import { dispatchWarehouseOrderFormAction } from "../../../../actions";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string; itemId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function searchValue(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
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

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : "The order could not be dispatched.";
}

export default async function WarehouseProductDetailPage({ params, searchParams }: PageProps) {
  const { id, itemId } = await params;
  const [detail, policy] = await Promise.all([
    loadWarehouseOrderDetail(id),
    getAdminSettingsPolicy()
  ]);

  const order = detail.data.order;
  if (!order) notFound();

  const item = detail.data.orderItems.find((row) => {
    const productSlug = String(row.product_slug ?? "");
    const sku = String(row.sku ?? "");
    return String(row.id ?? `${productSlug}-${sku}`) === itemId;
  });
  if (!item) notFound();

  const productSlug = String(item.product_slug ?? "");
  const sku = String(item.sku ?? "");
  const product = detail.data.products.find((row) => String(row.slug ?? "") === productSlug);
  const productName = String(item.product_name ?? product?.name ?? productSlug);
  const metadata = orderMetadata(order);
  const warehouseCode = String(metadata.assigned_warehouse_code ?? policy.defaultWarehouseCode);
  const orderNumber = String(order.order_number ?? id);
  const fulfillmentStatus = String(order.fulfillment_status ?? "pending");
  const query = searchParams ? await searchParams : {};
  const operationStatus = searchValue(query, "operation_status");
  const operationMessage = searchValue(query, "operation_message");
  const image = firstImageFrom(product?.image) ?? firstImageFrom(product?.hero);

  async function dispatchOrderWithFeedback(formData: FormData) {
    "use server";
    try {
      await dispatchWarehouseOrderFormAction(formData);
    } catch (error) {
      if (isActionNavigationError(error)) throw error;
      redirect(
        `/warehouse/fulfillment/${id}/products/${encodeURIComponent(itemId)}?operation_status=error&operation_message=${encodeURIComponent(messageFromError(error))}`
      );
    }
    redirect(`/warehouse/activity?operation_status=success&operation_message=${encodeURIComponent("Order dispatched.")}`);
  }

  return (
    <>
      <WarehouseOpsLiveSync />
      <Breadcrumb
        items={[
          { label: "Fulfillment", href: "/warehouse/fulfillment" },
          { label: orderNumber, href: `/warehouse/fulfillment/${id}` },
          { label: productName }
        ]}
      />
      <ControlShell
        eyebrow="Product"
        title={productName}
        description={`Order ${orderNumber} · ${employeeFulfillmentLabel(fulfillmentStatus)}`}
        actions={[{ label: "Back to order", href: `/warehouse/fulfillment/${id}` }]}
      >
        <OperationalFeedback
          status={operationStatus}
          message={operationMessage}
          context="Dispatch"
          idle="Review this product, then dispatch the complete order."
        />

        <section className="@container mx-auto grid w-full max-w-4xl min-w-0 gap-5 rounded-[var(--platform-radius)] bg-[var(--platform-surface-muted)] p-4 @md:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="@container grid min-w-0 gap-5 @sm:grid-cols-[10rem_minmax(0,1fr)]">
            <div className="relative grid aspect-square w-full max-w-[10rem] shrink-0 place-items-center overflow-hidden rounded-lg bg-[var(--platform-surface)]">
              {image ? (
                <Image
                  src={image}
                  alt={productName}
                  width={320}
                  height={320}
                  className="h-full w-full object-contain p-3"
                />
              ) : (
                <span className="text-4xl font-semibold text-[var(--platform-text-muted)]">
                  {productName.slice(0, 1)}
                </span>
              )}
            </div>

            <div className="min-w-0">
              <p className="text-xs font-medium text-[var(--platform-text-muted)]">Product to dispatch</p>
              <h2 className="mt-1 min-w-0 break-words text-xl font-semibold tracking-tight text-[var(--platform-text-primary)]">
                {productName}
              </h2>
              <dl className="mt-5 grid gap-3 text-sm">
                <div className="min-w-0">
                  <dt className="text-[var(--platform-text-muted)]">SKU</dt>
                  <dd className="mt-1 min-w-0 break-all font-mono text-xs text-[var(--platform-text-secondary)]">{sku || "—"}</dd>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="min-w-0">
                    <dt className="text-[var(--platform-text-muted)]">Quantity</dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums text-[var(--platform-text-primary)]">
                      {String(item.quantity ?? 0)}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[var(--platform-text-muted)]">Location</dt>
                    <dd className="mt-1 min-w-0 break-words text-[var(--platform-text-primary)]">{warehouseCode}</dd>
                  </div>
                </div>
                <div className="min-w-0">
                  <dt className="text-[var(--platform-text-muted)]">Customer</dt>
                  <dd className="mt-1 min-w-0 break-words text-[var(--platform-text-primary)]">
                    {warehouseCustomerName(order)}
                  </dd>
                  <dd className="mt-1 min-w-0 break-words text-xs text-[var(--platform-text-secondary)]">
                    {warehouseCustomerPhone(order)}
                  </dd>
                  <dd className="mt-0.5 min-w-0 break-words text-xs text-[var(--platform-text-secondary)]">
                    {warehouseCustomerEmail(order)}
                  </dd>
                  <dd className="mt-2 min-w-0 break-words text-xs text-[var(--platform-text-muted)]">
                    {warehouseShippingAddress(order)}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          <aside className="grid min-w-0 content-start gap-3">
            {canDispatchOrder(fulfillmentStatus) ? (
              <OperationalPrimaryAction
                title="Dispatch order"
                description="Dispatches this product and every item in the order."
                action={dispatchOrderWithFeedback}
                buttonLabel="Dispatch"
                pendingLabel="Dispatching"
              >
                <input name="order_id" type="hidden" value={id} />
                <input name="warehouse_code" type="hidden" value={warehouseCode} />
              </OperationalPrimaryAction>
            ) : (
              <p className="rounded-lg bg-[var(--platform-surface)] p-4 text-sm text-[var(--platform-text-secondary)]">
                This order is {employeeFulfillmentLabel(fulfillmentStatus).toLowerCase()} and cannot be dispatched again.
              </p>
            )}
            <Link
              href={`/warehouse/fulfillment/${id}`}
              className="text-center text-sm font-medium text-[var(--platform-accent)] hover:underline"
            >
              Back to order
            </Link>
          </aside>
        </section>
      </ControlShell>
    </>
  );
}
