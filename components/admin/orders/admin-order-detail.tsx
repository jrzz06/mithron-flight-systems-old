"use client";

import { useEffect, useRef } from "react";
import { AdminOrderContactRequestBanner } from "@/components/admin/orders/admin-order-contact-request-banner";
import { AdminOrderCustomerSection } from "@/components/admin/orders/admin-order-customer-section";
import { AdminOrderInvoiceSection } from "@/components/admin/orders/admin-order-invoice-section";
import { AdminOrderNotesSection } from "@/components/admin/orders/admin-order-notes-section";
import { AdminOrderPaymentSection } from "@/components/admin/orders/admin-order-payment-section";
import { AdminOrderProductsSection } from "@/components/admin/orders/admin-order-products-section";
import { AdminOrderShippingSection } from "@/components/admin/orders/admin-order-shipping-section";
import { AdminOrderSummarySection } from "@/components/admin/orders/admin-order-summary-section";
import { AdminOrderTimeline } from "@/components/admin/orders/admin-order-timeline";
import { OrderDetailShell, OrderStickyHeader } from "@/components/admin/orders/order-detail-primitives";
import { orderItemsForOrder, isHandedOffToWarehouse, type AdminRow } from "@/components/admin/orders/order-view-helpers";
import type { AdminOrderFormAction } from "@/lib/admin/order-action-result";

type CatalogProduct = {
  slug: string;
  name: string;
  price: number;
  chargeTax?: boolean | null;
  taxRate?: number | null;
  taxIncluded?: boolean | null;
  taxGroup?: string | null;
};

type AdminOrderDetailProps = {
  order: AdminRow;
  orderId: string;
  allOrders: AdminRow[];
  orderItems: AdminRow[];
  products: AdminRow[];
  inventory: AdminRow[];
  shipments: AdminRow[];
  catalogProducts: CatalogProduct[];
  defaultWarehouseCode: string;
  queue: string;
  filtersQuery: string;
  onSelectOrder?: (orderNumber: string) => void;
  onClearSelection?: () => void;
  updateOrderShippingAddressAction?: AdminOrderFormAction;
  addOrderItemsAction?: AdminOrderFormAction;
  removeOrderItemAction?: AdminOrderFormAction;
};

export function AdminOrderDetail({
  order,
  orderId,
  allOrders,
  orderItems,
  products,
  inventory,
  shipments,
  catalogProducts,
  defaultWarehouseCode,
  queue,
  filtersQuery,
  onSelectOrder,
  onClearSelection,
  updateOrderShippingAddressAction,
  addOrderItemsAction,
  removeOrderItemAction
}: AdminOrderDetailProps) {
  const items = orderItemsForOrder(orderId, orderItems);
  const selectedShipments = shipments.filter((shipment) => String(shipment.order_id) === orderId);
  const detailScrollRef = useRef<HTMLDivElement>(null);
  const handedOffToWarehouse = isHandedOffToWarehouse(order);
  const editableShippingAction = handedOffToWarehouse ? undefined : updateOrderShippingAddressAction;
  const editableAddItemsAction = handedOffToWarehouse ? undefined : addOrderItemsAction;
  const editableRemoveItemAction = handedOffToWarehouse ? undefined : removeOrderItemAction;

  useEffect(() => {
    detailScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [orderId]);

  const backHeader = onClearSelection ? (
    <button
      type="button"
      onClick={onClearSelection}
      className="inline-flex items-center gap-1 text-sm font-medium text-violet-300 hover:underline"
      data-order-detail-back
    >
      ← Back to Orders
    </button>
  ) : null;

  return (
    <OrderDetailShell scrollRef={detailScrollRef} header={backHeader}>
      <OrderStickyHeader order={order} defaultWarehouseCode={defaultWarehouseCode} />
      {handedOffToWarehouse ? (
        <div className="rounded-[8px] border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
          Handed off to warehouse — admin view is read-only.
        </div>
      ) : null}
      <AdminOrderContactRequestBanner order={order} itemCount={items.length} />
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <AdminOrderSummarySection order={order} defaultWarehouseCode={defaultWarehouseCode} />
        <AdminOrderCustomerSection
          order={order}
          allOrders={allOrders}
          queue={queue}
          filtersQuery={filtersQuery}
          onSelectOrder={onSelectOrder}
        />
      </div>
      <AdminOrderProductsSection
        items={items}
        products={products}
        inventory={inventory}
        order={order}
        defaultWarehouseCode={defaultWarehouseCode}
        catalogProducts={catalogProducts}
        addOrderItemsAction={editableAddItemsAction}
        removeOrderItemAction={editableRemoveItemAction}
        queue={queue}
        filtersQuery={filtersQuery}
      />
      <AdminOrderShippingSection
        order={order}
        shipments={selectedShipments}
        defaultWarehouseCode={defaultWarehouseCode}
        updateShippingAddressAction={editableShippingAction}
        queue={queue}
        filtersQuery={filtersQuery}
      />
      <AdminOrderPaymentSection key={orderId} order={order} orderId={orderId} />
      <AdminOrderInvoiceSection order={order} orderId={orderId} />
      <AdminOrderTimeline order={order} />
      <AdminOrderNotesSection order={order} />
    </OrderDetailShell>
  );
}
