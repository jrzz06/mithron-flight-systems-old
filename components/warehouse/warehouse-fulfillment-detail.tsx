import Link from "next/link";
import Image from "next/image";
import {
  OperationalDangerAction,
  OperationalMoreActions,
  OperationalPrimaryAction
} from "@/components/admin/operational-action-panel";
import { parseShipmentTracking } from "@/lib/customer/shipment-tracking";
import { employeeFulfillmentLabel } from "@/lib/warehouse/operational-labels";
import {
  formatOrderDate,
  assignedPicker,
  shippingMethod,
  warehouseCustomerEmail,
  warehouseCustomerName,
  warehouseCustomerPhone,
  warehouseShippingAddress,
  type WarehouseOrderRow
} from "@/lib/warehouse/order-helpers";

type OrderItemRow = {
  id: string;
  productName: string;
  productSlug: string;
  sku: string;
  quantity: number;
  image: string | null;
  warehouseLocation: string;
};

type WarehouseFulfillmentDetailProps = {
  order: Record<string, unknown>;
  orderRow: WarehouseOrderRow;
  items: OrderItemRow[];
  dispatchAction: (formData: FormData) => Promise<void>;
  cancelAction: (formData: FormData) => Promise<void>;
};

function canCancelFulfillment(status: string) {
  return !["dispatched", "shipped", "delivered", "cancelled", "returned"].includes(status);
}

function canDispatch(status: string) {
  return ["pending", "packing", "processing", "picked", "packed", "ready_to_dispatch"].includes(status);
}

export function WarehouseFulfillmentDetail({
  order,
  orderRow,
  items,
  dispatchAction,
  cancelAction
}: WarehouseFulfillmentDetailProps) {
  const customerName = warehouseCustomerName(order);
  const customerEmail = warehouseCustomerEmail(order);
  const customerPhone = warehouseCustomerPhone(order);
  const address = warehouseShippingAddress(order);
  const step = orderRow.fulfillmentStatus;
  const tracking = parseShipmentTracking(order.shipment_tracking);

  return (
    <div className="grid min-w-0 gap-5">
      <section className="@container grid min-w-0 gap-4 rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] p-4 @md:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] @md:items-start">
        <div className="min-w-0">
          <h2 className="min-w-0 break-words text-lg font-semibold text-[var(--platform-text-primary)]">
            {orderRow.orderNumber}
          </h2>
          <p className="mt-1 min-w-0 break-words text-sm text-[var(--platform-text-secondary)]">
            {employeeFulfillmentLabel(step)} · {orderRow.paymentStatus} · Priority {orderRow.priority}
          </p>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--platform-text-muted)]">
            Review the products below, then dispatch the complete order. Courier details appear on the customer order tracking page after dispatch.
          </p>
        </div>
        <div className="grid min-w-0 gap-3">
          {canDispatch(step) ? (
            <OperationalPrimaryAction
              title="Dispatch order"
              description="One click receives, prepares, and dispatches this order."
              action={dispatchAction}
              buttonLabel="Mark Dispatched"
              pendingLabel="Dispatching"
            >
              <input name="order_id" type="hidden" value={orderRow.orderId} />
              <input name="warehouse_code" type="hidden" value={orderRow.warehouseCode} />
            </OperationalPrimaryAction>
          ) : null}

          {canCancelFulfillment(step) ? (
            <OperationalMoreActions>
              <OperationalDangerAction
                action={cancelAction}
                buttonLabel="Cancel & Delete Order"
                pendingLabel="Cancelling"
              >
                <input name="order_id" type="hidden" value={orderRow.orderId} />
                <input name="expected_updated_at" type="hidden" value={orderRow.updatedAt} />
                <textarea
                  name="cancel_reason"
                  required
                  rows={2}
                  placeholder="Cancellation reason"
                  className="w-full min-w-0 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-3 py-2 text-sm"
                />
              </OperationalDangerAction>
            </OperationalMoreActions>
          ) : null}
        </div>
      </section>

      <section className="@container grid min-w-0 gap-4 rounded-[var(--platform-radius)] bg-[var(--platform-surface-muted)] p-4 @sm:grid-cols-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--platform-text-primary)]">Customer</h3>
          <dl className="mt-3 grid gap-2 text-sm">
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">Name</dt>
              <dd className="mt-0.5 min-w-0 break-words text-[var(--platform-text-secondary)]">{customerName}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">Phone</dt>
              <dd className="mt-0.5 min-w-0 break-words text-[var(--platform-text-secondary)]">{customerPhone}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">Email</dt>
              <dd className="mt-0.5 min-w-0 break-words text-[var(--platform-text-secondary)]">{customerEmail}</dd>
            </div>
          </dl>
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--platform-text-primary)]">Shipping</h3>
          <p className="mt-2 min-w-0 break-words text-sm text-[var(--platform-text-secondary)]">{shippingMethod(order)}</p>
          <p className="min-w-0 break-words text-sm text-[var(--platform-text-secondary)]">Assigned: {assignedPicker(order)}</p>
          <p className="min-w-0 break-words text-sm text-[var(--platform-text-secondary)]">Created: {formatOrderDate(order.created_at)}</p>
          {tracking?.carrier ? (
            <p className="min-w-0 break-words text-sm text-[var(--platform-text-secondary)]">Carrier: {tracking.carrier}</p>
          ) : null}
          {tracking?.trackingNumber ? (
            <p className="min-w-0 break-words text-sm text-[var(--platform-text-secondary)]">Tracking: {tracking.trackingNumber}</p>
          ) : null}
          <p className="mt-3 text-xs font-medium uppercase tracking-[0.12em] text-[var(--platform-text-muted)]">Ship to</p>
          {address && address !== "—" ? (
            <p className="mt-2 min-w-0 whitespace-pre-line break-words text-sm text-[var(--platform-text-muted)]">{address}</p>
          ) : (
            <p className="mt-2 text-sm text-[var(--platform-text-muted)]">No shipping address on file.</p>
          )}
        </div>
      </section>

      <section className="grid min-w-0 gap-3">
        <h3 className="text-sm font-semibold text-[var(--platform-text-primary)]">Products</h3>
        <div className="min-w-0 overflow-x-auto rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)]">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead className="border-b border-[var(--platform-border)] text-[11px] uppercase tracking-[0.08em] text-[var(--platform-text-muted)]">
              <tr>
                <th className="px-3 py-3">Image</th>
                <th className="px-3 py-3">Product</th>
                <th className="px-3 py-3">SKU</th>
                <th className="px-3 py-3">Qty</th>
                <th className="px-3 py-3">Location</th>
                <th className="px-3 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--platform-border)]">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-3">
                    <div className="relative grid aspect-square size-10 shrink-0 place-items-center overflow-hidden rounded border border-[var(--platform-border)] bg-[var(--platform-surface)]">
                      {item.image ? (
                        <Image
                          src={item.image}
                          alt={item.productName}
                          width={40}
                          height={40}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <span className="text-xs text-[var(--platform-text-muted)]">{item.productName.slice(0, 1)}</span>
                      )}
                    </div>
                  </td>
                  <td className="max-w-[16rem] px-3 py-3">
                    <span className="block min-w-0 break-words text-[var(--platform-text-primary)]">{item.productName}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="block min-w-0 break-all font-mono text-xs">{item.sku}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">{String(item.quantity)}</td>
                  <td className="px-3 py-3">
                    <span className="block min-w-0 break-words">{item.warehouseLocation}</span>
                  </td>
                  <td className="px-3 py-3">
                    <Link
                      href={`/warehouse/fulfillment/${orderRow.orderId}/products/${encodeURIComponent(item.id)}`}
                      className="platform-btn-secondary platform-btn-sm"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
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
