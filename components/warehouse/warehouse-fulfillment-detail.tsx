"use client";

import { Fragment, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Package } from "lucide-react";
import {
  OperationalDangerAction,
  OperationalMoreActions,
  OperationalPrimaryAction
} from "@/components/admin/operational-action-panel";
import { resolveNextImageSrc } from "@/lib/media/next-image-src";
import { employeeFulfillmentLabel } from "@/lib/warehouse/operational-labels";
import {
  canCancelOrder,
  canDispatchOrder,
  formatOrderDate,
  paymentStatusLabel,
  warehouseCustomerEmail,
  warehouseCustomerName,
  warehouseCustomerPhone,
  warehouseShippingAddress,
  type WarehouseOrderRow
} from "@/lib/warehouse/order-helpers";

export type OrderItemRow = {
  id: string;
  productName: string;
  productSlug: string;
  sku: string;
  variantLabel: string;
  quantity: number;
  lineTotal: string;
  image: string | null;
  imageCount: number;
};

type WarehouseFulfillmentDetailProps = {
  order: Record<string, unknown>;
  orderRow: WarehouseOrderRow;
  items: OrderItemRow[];
  dispatchAction: (formData: FormData) => Promise<void>;
  cancelAction: (formData: FormData) => Promise<void>;
};

const labelClass =
  "text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--platform-text-muted)]";
const valueClass = "mt-1 text-sm leading-5 text-[var(--platform-text-primary)]";
const valueStrongClass = "mt-1 text-base font-semibold leading-5 text-[var(--platform-text-primary)]";

function ProductPreviewImage({ src, alt }: { src: string | null; alt: string }) {
  return (
    <div className="relative mx-auto aspect-[4/3] w-full max-h-[min(48vh,20rem)] overflow-hidden rounded-[10px] border border-[var(--platform-border)] bg-[#f4f4f5] sm:mx-0 sm:max-w-sm">
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          className="object-contain p-3"
          sizes="(max-width: 640px) 92vw, 24rem"
          unoptimized
          priority
        />
      ) : (
        <div className="grid h-full min-h-[10rem] w-full place-items-center text-zinc-400">
          <Package size={40} strokeWidth={1.5} aria-hidden />
          <span className="mt-2 text-xs text-zinc-500">No product image</span>
        </div>
      )}
    </div>
  );
}

function ProductRowThumb({
  src,
  alt,
  imageCount
}: {
  src: string | null;
  alt: string;
  imageCount: number;
}) {
  const extra = Math.max(0, imageCount - 1);
  return (
    <div className="relative h-[76px] w-[76px] shrink-0 overflow-hidden rounded-[8px] border border-[var(--platform-border)] bg-[#f4f4f5]">
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          className="object-contain p-1.5"
          sizes="76px"
          unoptimized
        />
      ) : (
        <div className="grid h-full w-full place-items-center text-zinc-400">
          <Package size={22} strokeWidth={1.5} aria-hidden />
        </div>
      )}
      {extra > 0 ? (
        <span
          className="absolute bottom-1 right-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white"
          aria-label={`${extra} more images`}
        >
          +{extra}
        </span>
      ) : null}
    </div>
  );
}

export function WarehouseFulfillmentDetail({
  order,
  orderRow,
  items,
  dispatchAction,
  cancelAction
}: WarehouseFulfillmentDetailProps) {
  const [previewItemId, setPreviewItemId] = useState<string | null>(null);
  const customerName = warehouseCustomerName(order);
  const customerEmail = warehouseCustomerEmail(order);
  const customerPhone = warehouseCustomerPhone(order);
  const address = warehouseShippingAddress(order);
  const step = orderRow.fulfillmentStatus;
  const statusLabel = employeeFulfillmentLabel(step);
  const paymentLabel = paymentStatusLabel(String(order.payment_status ?? orderRow.paymentStatusRaw));
  const orderTotal = order.total != null ? String(order.total) : "—";
  const currency = typeof order.currency === "string" && order.currency.trim() ? order.currency.trim() : "";
  const totalDisplay = currency ? `${currency} ${orderTotal}` : orderTotal;

  function togglePreview(itemId: string) {
    setPreviewItemId((current) => (current === itemId ? null : itemId));
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl min-w-0 gap-3">
      {/* Order summary + Dispatch */}
      <section className="grid min-w-0 items-stretch gap-0 overflow-hidden rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] lg:grid-cols-[minmax(0,1fr)_minmax(14rem,17.5rem)]">
        <div className="min-w-0 border-b border-[var(--platform-border)] p-4 sm:p-5 lg:border-b-0 lg:border-r">
          <p className={labelClass}>Order ID</p>
          <h2 className="mt-1 min-w-0 break-words text-xl font-semibold tracking-[-0.02em] text-[var(--platform-text-primary)] sm:text-2xl">
            {orderRow.orderNumber}
          </h2>

          <dl className="mt-4 grid gap-3 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-3">
            <div className="min-w-0">
              <dt className={labelClass}>Order status</dt>
              <dd className={valueStrongClass}>{statusLabel}</dd>
            </div>
            <div className="min-w-0">
              <dt className={labelClass}>Received</dt>
              <dd className={valueClass}>{formatOrderDate(order.created_at)}</dd>
            </div>
            <div className="min-w-0">
              <dt className={labelClass}>Payment status</dt>
              <dd className={valueStrongClass}>{paymentLabel}</dd>
            </div>
            <div className="min-w-0">
              <dt className={labelClass}>Order total</dt>
              <dd className={valueStrongClass}>{totalDisplay}</dd>
            </div>
          </dl>
        </div>

        <div className="flex min-w-0 flex-col justify-center gap-2 p-4 sm:p-5">
          {canDispatchOrder(step) ? (
            <OperationalPrimaryAction
              className="!border-0 !bg-transparent !p-0 !shadow-none"
              title="Dispatch order"
              description="Mark dispatched and move to History."
              action={dispatchAction}
              buttonLabel="Dispatch"
              pendingLabel="Dispatching"
              confirmMessage={`Dispatch order ${orderRow.orderNumber}?`}
              confirmDescription="This moves the order to Dispatch History."
              confirmLabel="Dispatch"
            >
              <input name="order_id" type="hidden" value={orderRow.orderId} />
              <input name="warehouse_code" type="hidden" value={orderRow.warehouseCode} />
            </OperationalPrimaryAction>
          ) : (
            <p className="text-sm text-[var(--platform-text-muted)]">
              This order is {statusLabel.toLowerCase()}.
            </p>
          )}

          {canCancelOrder(step) ? (
            <OperationalMoreActions summaryLabel="More actions">
              <OperationalDangerAction
                action={cancelAction}
                buttonLabel="Delete order"
                pendingLabel="Deleting"
                confirmMessage={`Delete order ${orderRow.orderNumber}?`}
                confirmDescription="This permanently deletes the order from the warehouse queue. Type the order number to confirm."
                requireTypedText={orderRow.orderNumber}
                typedTextLabel={`Type ${orderRow.orderNumber} to confirm`}
                confirmLabel="Delete"
              >
                <input name="order_id" type="hidden" value={orderRow.orderId} />
                <input name="expected_updated_at" type="hidden" value={orderRow.updatedAt} />
                <textarea
                  name="cancel_reason"
                  required
                  rows={2}
                  placeholder="Deletion reason"
                  className="w-full min-w-0 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-3 py-2 text-sm"
                />
              </OperationalDangerAction>
            </OperationalMoreActions>
          ) : null}
        </div>
      </section>

      {/* Customer + shipping — equal columns */}
      <section className="grid min-w-0 gap-4 rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] p-4 sm:grid-cols-2 sm:gap-6 sm:p-5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--platform-text-primary)]">Customer details</h3>
          <dl className="mt-3 grid gap-3">
            <div className="min-w-0">
              <dt className={labelClass}>Name</dt>
              <dd className={`${valueClass} break-words`}>{customerName}</dd>
            </div>
            <div className="min-w-0">
              <dt className={labelClass}>Phone</dt>
              <dd className={`${valueClass} break-words`}>{customerPhone}</dd>
            </div>
            <div className="min-w-0">
              <dt className={labelClass}>Email</dt>
              <dd className={`${valueClass} break-words`}>{customerEmail}</dd>
            </div>
          </dl>
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--platform-text-primary)]">Shipping address</h3>
          {address && address !== "—" ? (
            <p className={`mt-3 ${valueClass} whitespace-pre-line break-words`}>{address}</p>
          ) : (
            <p className="mt-3 text-sm text-[var(--platform-text-muted)]">No shipping address on file.</p>
          )}
        </div>
      </section>

      {/* Products */}
      <section className="grid min-w-0 gap-2">
        <h3 className="text-sm font-semibold text-[var(--platform-text-primary)]">Products</h3>
        <div className="min-w-0 overflow-hidden rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)]">
          <table className="w-full table-fixed border-collapse text-left text-sm">
            <colgroup>
              <col className="w-[5.75rem]" />
              <col />
              <col className="w-[3.25rem]" />
              <col className="w-[5.5rem]" />
              <col className="w-[7.25rem]" />
            </colgroup>
            <thead className="border-b border-[var(--platform-border)]">
              <tr className={labelClass}>
                <th className="px-3 py-2.5 font-medium">Image</th>
                <th className="px-3 py-2.5 font-medium">Product</th>
                <th className="px-3 py-2.5 font-medium text-right">Qty</th>
                <th className="px-3 py-2.5 font-medium text-right">Price</th>
                <th className="px-3 py-2.5 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--platform-border)]">
              {items.map((item) => {
                const imageSrc = item.image ? resolveNextImageSrc(item.image) : null;
                const previewOpen = previewItemId === item.id;
                const subLine = [item.sku, item.variantLabel].filter(Boolean).join(" · ");

                return (
                  <Fragment key={item.id}>
                    {previewOpen ? (
                      <tr data-warehouse-product-preview>
                        <td colSpan={5} className="bg-[var(--platform-surface)]/40 px-3 py-3">
                          <div className="grid min-w-0 gap-3 rounded-[10px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] p-3">
                            <div className="flex min-w-0 items-start justify-between gap-3">
                              <p className="text-sm font-semibold text-[var(--platform-text-primary)]">
                                Product details
                              </p>
                              <button
                                type="button"
                                onClick={() => setPreviewItemId(null)}
                                className="platform-btn-ghost platform-btn-sm shrink-0"
                                aria-label="Close product details"
                              >
                                Close
                              </button>
                            </div>
                            <ProductPreviewImage src={imageSrc} alt={item.productName} />
                            <dl className="grid min-w-0 gap-2.5 text-sm sm:grid-cols-2">
                              <div className="min-w-0 sm:col-span-2">
                                <dt className={labelClass}>Name</dt>
                                <dd className={`${valueStrongClass} break-words`}>{item.productName}</dd>
                              </div>
                              {subLine ? (
                                <div className="min-w-0 sm:col-span-2">
                                  <dt className={labelClass}>SKU / Variant</dt>
                                  <dd className={`${valueClass} break-all font-mono text-xs`}>{subLine}</dd>
                                </div>
                              ) : null}
                              <div className="min-w-0">
                                <dt className={labelClass}>Quantity</dt>
                                <dd className={valueClass}>{item.quantity}</dd>
                              </div>
                              <div className="min-w-0">
                                <dt className={labelClass}>Price</dt>
                                <dd className={valueStrongClass}>{item.lineTotal}</dd>
                              </div>
                            </dl>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                    <tr className="align-middle">
                      <td className="px-3 py-3">
                        <ProductRowThumb
                          src={imageSrc}
                          alt={item.productName}
                          imageCount={item.imageCount}
                        />
                      </td>
                      <td className="min-w-0 px-3 py-3">
                        <span
                          className="line-clamp-2 text-sm font-medium leading-5 text-[var(--platform-text-primary)]"
                          title={item.productName}
                        >
                          {item.productName}
                        </span>
                        {subLine ? (
                          <span
                            className="mt-1 block truncate font-mono text-xs text-[var(--platform-text-muted)]"
                            title={subLine}
                          >
                            {subLine}
                          </span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-[var(--platform-text-primary)]">
                        {String(item.quantity)}
                      </td>
                      <td
                        className="truncate px-3 py-3 text-right tabular-nums font-medium text-[var(--platform-text-primary)]"
                        title={item.lineTotal}
                      >
                        {item.lineTotal}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          aria-expanded={previewOpen}
                          onClick={() => togglePreview(item.id)}
                          className="platform-btn-secondary platform-btn-sm inline-flex min-w-[6.5rem] justify-center"
                        >
                          {previewOpen ? "Hide" : "View product"}
                        </button>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <Link href="/warehouse/orders" className="w-fit text-sm font-medium text-[var(--platform-accent)] hover:underline">
        Back to orders
      </Link>
    </div>
  );
}
