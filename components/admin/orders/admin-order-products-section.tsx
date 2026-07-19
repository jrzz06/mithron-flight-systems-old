"use client";

import { wrapServerAction } from "@/hooks/use-async-action";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useOptionalAdminRealtime } from "@/components/admin/realtime/admin-realtime-provider";
import { OrderItemPicker } from "@/components/admin/order-item-picker";
import { OperationalSubmitButton } from "@/components/admin/operational-submit-button";
import { useAdminOrdersLiveState } from "@/components/admin/orders/admin-orders-live-state";
import { calculateProductTaxBreakdown } from "@/lib/product-tax";
import { resolveNextImageSrc } from "@/lib/media/next-image-src";
import { parseConversionLineItems } from "@/lib/admin/order-items";
import { runOrderFormActionWithConflictRetry } from "@/lib/admin/order-action-client";
import type { AdminOrderFormAction } from "@/lib/admin/order-action-result";
import { isActionNavigationError } from "@/lib/server-action-errors";
import { markControlPlaneLiveSyncFlush } from "@/lib/control-plane/shared-live-sync-coordinator";
import {
  OrderDetailSection,
  OrderField,
  OrderFieldGrid,
  OrderStockBadge,
  orderHoverClass
} from "@/components/admin/orders/order-detail-primitives";
import {
  orderClamp2,
  orderInlineButtonClass,
  orderLongText,
  orderProductCardBody,
  orderProductCardGrid,
  orderRadiusControl,
  orderSectionStack,
  orderWrapRow
} from "@/components/admin/orders/order-layout-utils";
import { OrderProductThumbnail } from "@/components/admin/orders/order-product-thumbnail";
import {
  assignedWarehouseCode,
  moneyText,
  numberText,
  resolveProductImage,
  text,
  type AdminRow
} from "@/components/admin/orders/order-view-helpers";
import { resolveCatalogAvailability } from "@/lib/inventory-availability";

type CatalogProduct = {
  slug: string;
  name: string;
  price: number;
  chargeTax?: boolean | null;
  taxRate?: number | null;
  taxIncluded?: boolean | null;
  taxGroup?: string | null;
};

type AdminOrderProductsSectionProps = {
  items: AdminRow[];
  products: AdminRow[];
  inventory: AdminRow[];
  order: AdminRow;
  defaultWarehouseCode: string;
  catalogProducts: CatalogProduct[];
  addOrderItemsAction?: AdminOrderFormAction;
  removeOrderItemAction?: AdminOrderFormAction;
  queue?: string;
  filtersQuery?: string;
};

export function AdminOrderProductsSection({
  items,
  products,
  inventory,
  order,
  defaultWarehouseCode,
  catalogProducts,
  addOrderItemsAction,
  removeOrderItemAction,
  queue = "active",
  filtersQuery = ""
}: AdminOrderProductsSectionProps) {
  const warehouse = assignedWarehouseCode(order, defaultWarehouseCode);
  const [showPicker, setShowPicker] = useState(false);
  const realtime = useOptionalAdminRealtime();
  const { appendOptimisticOrderItems, patchOrder } = useAdminOrdersLiveState();
  const canModifyProducts =
    !["cancelled", "delivered", "returned", "refunded"].includes(text(order.status, "draft"));
  const canAddProducts = Boolean(addOrderItemsAction) && canModifyProducts;
  const canRemoveProducts = Boolean(removeOrderItemAction) && canModifyProducts;

  const removeOrderItem = useCallback(
    async (formData: FormData) => {
      if (!removeOrderItemAction) return;
      const orderId = text(order.id);
      let navigated = false;
      try {
        const outcome = await runOrderFormActionWithConflictRetry(removeOrderItemAction, formData, {
          orderId,
          patchOrder
        });
        if (outcome.kind === "failed") return;
      } catch (error) {
        if (isActionNavigationError(error)) {
          navigated = true;
          throw error;
        }
        throw error;
      } finally {
        if (!navigated) {
          markControlPlaneLiveSyncFlush();
          void realtime?.reconcileResources(["orders"]);
        }
      }
    },
    [order.id, patchOrder, realtime, removeOrderItemAction]
  );

  const timedRemoveOrderItem = useMemo(
    () => wrapServerAction(removeOrderItem, { label: "Remove order item" }),
    [removeOrderItem]
  );

  const addOrderItems = useCallback(
    async (formData: FormData) => {
      if (!addOrderItemsAction) return;
      const rawItems = String(formData.get("order_items") ?? "");
      const parsed = parseConversionLineItems(rawItems);
      const orderId = text(order.id);
      const optimisticRows: AdminRow[] = parsed.map((line, index) => {
        const catalog = catalogProducts.find((row) => row.slug === line.productSlug);
        const unitPrice = catalog?.price ?? 0;
        return {
          id: `optimistic-${orderId}-${line.productSlug}-${Date.now()}-${index}`,
          order_id: orderId,
          product_slug: line.productSlug,
          product_name: catalog?.name ?? line.productSlug,
          quantity: line.quantity,
          unit_price: unitPrice,
          line_total: unitPrice * line.quantity,
          sku: "",
          metadata: {},
          _optimistic: true
        };
      });

      if (optimisticRows.length) {
        appendOptimisticOrderItems(optimisticRows);
        setShowPicker(false);
      }

      let navigated = false;
      try {
        const outcome = await runOrderFormActionWithConflictRetry(addOrderItemsAction, formData, {
          orderId,
          patchOrder
        });
        if (outcome.kind === "failed") {
          // Realtime/RSC refresh will drop optimistic rows once server state arrives.
          return;
        }
      } catch (error) {
        if (isActionNavigationError(error)) {
          navigated = true;
          throw error;
        }
        throw error;
      } finally {
        if (!navigated) {
          markControlPlaneLiveSyncFlush();
          void realtime?.reconcileResources(["orders"]);
        }
      }
    },
    [addOrderItemsAction, appendOptimisticOrderItems, catalogProducts, order.id, patchOrder, realtime]
  );

  const timedAddOrderItems = useMemo(
    () => wrapServerAction(addOrderItems, { label: "Add order items" }),
    [addOrderItems]
  );
  return (
    <OrderDetailSection title="Products" dataAttribute="data-inventory-allocation">
      <div className={orderSectionStack}>
        {items.length ? (
          items.map((item) => {
            const slug = text(item.product_slug);
            const sku = text(item.sku);
            const itemMeta =
              item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
                ? (item.metadata as Record<string, unknown>)
                : {};
            const variant = text(itemMeta.variant_label) || text(itemMeta.variant) || sku || "—";
            const catalog = catalogProducts.find((row) => row.slug === slug);
            const qty = Number(item.quantity ?? 1) || 1;
            const lineTotal = Number(item.line_total ?? 0) || 0;
            const unitPrice = qty > 0 ? lineTotal / qty : lineTotal;
            const tax = calculateProductTaxBreakdown({
              unitPrice,
              quantity: qty,
              chargeTax: catalog?.chargeTax,
              taxRate: catalog?.taxRate,
              taxIncluded: catalog?.taxIncluded,
              taxGroup: catalog?.taxGroup
            });
            const available = resolveCatalogAvailability(slug, inventory);
            const image = resolveProductImage(products, slug);
            const imageSrc = image ? resolveNextImageSrc(image) : null;
            const productName = text(item.product_name, slug || "Product");
            const isOptimistic = Boolean(item._optimistic);

            return (
              <article
                key={text(item.id) || `${slug}-${sku}`}
                className={`${orderProductCardGrid} ${orderHoverClass()} hover:border-[var(--platform-border-strong)] ${
                  isOptimistic ? "opacity-70" : ""
                }`}
              >
                <OrderProductThumbnail src={imageSrc} alt={productName} size="detail" />
                <div className={orderProductCardBody}>
                  <p className={`${orderClamp2} ${orderLongText} platform-type-section-title font-semibold text-[var(--platform-text-primary)]`}>
                    {slug ? (
                      <Link
                        href={`/admin/products?product_slug=${encodeURIComponent(slug)}`}
                        className="hover:text-violet-300 hover:underline"
                      >
                        {productName}
                      </Link>
                    ) : (
                      productName
                    )}
                    {isOptimistic ? (
                      <span className="ml-2 text-xs font-medium text-[var(--platform-accent)]">Adding…</span>
                    ) : null}
                  </p>
                  <OrderFieldGrid columns={2}>
                    <OrderField label="SKU" value={sku || "—"} />
                    <OrderField label="Variant" value={variant} />
                    <OrderField label="Quantity" value={numberText(item.quantity)} />
                    <OrderField label="Unit price" value={moneyText(unitPrice)} />
                    <OrderField label="GST" value={moneyText(tax.taxAmount)} />
                    <OrderField label="Line total" value={moneyText(lineTotal)} />
                    <OrderField label="Warehouse" value={warehouse} />
                    <OrderField label="Available" value={numberText(available)} />
                  </OrderFieldGrid>
                </div>
                <div className={`${orderWrapRow} @sm:col-span-2 @sm:justify-end`}>
                  <OrderStockBadge available={available} />
                  {canRemoveProducts && text(item.id) && !isOptimistic ? (
                    <form
                      action={timedRemoveOrderItem}
                      className="inline-flex"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input type="hidden" name="order_id" value={text(order.id)} />
                      <input type="hidden" name="order_item_id" value={text(item.id)} />
                      <input type="hidden" name="queue" value={queue} />
                      <input type="hidden" name="q" value={filtersQuery} />
                      {text(order.updated_at) ? (
                        <input type="hidden" name="expected_updated_at" value={text(order.updated_at)} />
                      ) : null}
                      <OperationalSubmitButton
                        pendingLabel="Removing..."
                        confirmMessage={`Remove ${productName} from this order?`}
                        confirmDescription="This removes the line item from the order. Stock will be recalculated."
                        confirmLabel="Remove item"
                        className={`${orderInlineButtonClass} border-rose-700/60 text-rose-200 hover:bg-rose-950/30`}
                      >
                        Remove
                      </OperationalSubmitButton>
                    </form>
                  ) : null}
                  {slug ? (
                    <Link
                      href={`/admin/products?product_slug=${encodeURIComponent(slug)}`}
                      className={`${orderInlineButtonClass} text-violet-300 hover:bg-[var(--platform-surface)]`}
                    >
                      View product
                    </Link>
                  ) : null}
                </div>
              </article>
            );
          })
        ) : (
          <p className="platform-type-body text-[var(--platform-text-muted)]">No products added yet.</p>
        )}

        {canAddProducts && !showPicker ? (
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className={`${orderInlineButtonClass} w-fit text-[var(--platform-text-primary)] hover:bg-[var(--platform-surface)]`}
          >
            Add product
          </button>
        ) : null}

        {canAddProducts && showPicker && addOrderItemsAction ? (
          <form
            action={timedAddOrderItems}
            className={`grid gap-2 border border-[var(--platform-border)] p-4 ${orderRadiusControl}`}
          >
            <input type="hidden" name="order_id" value={text(order.id)} />
            <input type="hidden" name="queue" value={queue} />
            <input type="hidden" name="q" value={filtersQuery} />
            {text(order.updated_at) ? (
              <input type="hidden" name="expected_updated_at" value={text(order.updated_at)} />
            ) : null}
            <OrderItemPicker availableProducts={catalogProducts} />
            <div className="flex flex-wrap gap-2">
              <OperationalSubmitButton
                pendingLabel="Saving..."
                className="platform-btn-primary platform-btn-md"
              >
                Save products
              </OperationalSubmitButton>
              <button
                type="button"
                onClick={() => setShowPicker(false)}
                className="platform-btn-secondary platform-btn-md"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </OrderDetailSection>
  );
}
