"use client";

import { wrapServerAction } from "@/hooks/use-async-action";

import Link from "next/link";
import Image from "next/image";
import { Copy, Eye, EyeOff, MoreHorizontal, Pencil } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import { resolveNextImageSrc } from "@/lib/media/next-image-src";
import { formatINR } from "@/lib/utils";
import { notify } from "@/lib/feedback/notify";
import type { ProductDeletionBlockerResult } from "@/services/admin-actions";
import {
  previewProductDeleteAction,
  saveProductDuplicateFormAction,
  saveProductForceDeleteFormAction,
  saveProductHardDeleteFormAction,
  saveProductPublishStateFormAction,
  saveProductRemoveFormAction
} from "./actions";
import { ProductDetailEditDialog } from "./product-detail-edit-dialog-loader";
import type { ProductCategoryOption } from "./product-category-field";

const timedSaveProductPublishStateFormAction = wrapServerAction(saveProductPublishStateFormAction, { label: "Update product publish state" });
const timedSaveProductDuplicateFormAction = wrapServerAction(saveProductDuplicateFormAction, { label: "Duplicate product" });
const timedSaveProductForceDeleteFormAction = wrapServerAction(saveProductForceDeleteFormAction, { label: "Force delete product" });
const timedSaveProductHardDeleteFormAction = wrapServerAction(saveProductHardDeleteFormAction, { label: "Permanently delete product" });
const timedSaveProductRemoveFormAction = wrapServerAction(saveProductRemoveFormAction, { label: "Remove product" });

export type ProductCatalogGridRow = {
  id: string;
  title: string;
  category: string;
  status: string;
  thumbnailSrc?: string | null;
  price: string;
  compareAt?: string | null;
  badge?: string | null;
  badgeEnabled?: boolean;
  badgeText?: string | null;
  badgeStyle?: string | null;
  galleryUrls?: string[];
  galleryItems?: Array<{ src: string; alt?: string }>;
  description?: string | null;
  descriptionJson?: Record<string, unknown> | null;
  specs?: Record<string, string> | null;
  onSale?: boolean;
  discountType?: "percent" | "amount" | null;
  discountValue?: string | null;
  costOfGoods?: string | null;
  showPricePerUnit?: boolean;
  chargeTax?: boolean;
  taxGroup?: string | null;
  taxRate?: string | null;
  taxIncluded?: boolean;
  stockQuantity: string;
  stockStatus: string;
  checkoutWarehouseCode?: string;
  sourceAvailability: string;
  isVisible: boolean;
  updatedAt?: string | null;
};

const productActionClass =
  "product-row-btn inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors";

function statusClass(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "published") {
    return "text-[var(--platform-success)]";
  }
  if (normalized === "archived") {
    return "text-[var(--platform-text-muted)]";
  }
  return "text-[var(--platform-warning)]";
}

function formatCurrency(value: string) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return value || formatINR(0);
  return formatINR(numberValue);
}

function ProductImage({ product }: { product: ProductCatalogGridRow }) {
  const thumbnailSrc = resolveNextImageSrc(product.thumbnailSrc);

  return (
    <div data-product-image-well className="relative aspect-[7/4] overflow-hidden rounded-lg">
      {thumbnailSrc ? (
        <Image
          src={thumbnailSrc}
          alt=""
          fill
          sizes="(min-width: 1536px) 16vw, (min-width: 1280px) 20vw, (min-width: 768px) 40vw, 90vw"
          loading="lazy"
          className="object-contain p-4"
        />
      ) : (
        <div className="grid h-full place-items-center text-2xl font-medium text-[var(--platform-text-muted)]">
          {product.title.slice(0, 1).toUpperCase()}
        </div>
      )}
    </div>
  );
}

function ProductPublishToggle({
  product,
  isLiveOnStorefront,
  onPublishState
}: {
  product: ProductCatalogGridRow;
  isLiveOnStorefront: boolean;
  onPublishState: (id: string, status: string, visible: boolean) => void;
}) {
  const nextStatus = isLiveOnStorefront ? "draft" : "published";
  const label = isLiveOnStorefront ? "Unpublish" : "Publish";
  const Icon = isLiveOnStorefront ? EyeOff : Eye;

  return (
    <form
      action={timedSaveProductPublishStateFormAction}
      data-product-row-action="publish"
      onSubmit={() => onPublishState(product.id, nextStatus, !isLiveOnStorefront)}
      className="min-w-0"
    >
      <input type="hidden" name="product_slug" value={product.id} />
      <input type="hidden" name="workflow_status" value={nextStatus} />
      {isLiveOnStorefront ? null : <input type="hidden" name="is_visible" value="true" />}
      <input type="hidden" name="change_summary" value={`${label} product ${product.id}`} />
      <button
        type="submit"
        title={isLiveOnStorefront ? "Remove product from storefront" : "Publish product to storefront"}
        className="product-row-btn inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium text-[var(--platform-text-primary)] transition-colors"
        data-product-row-action="publish"
      >
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {label}
      </button>
    </form>
  );
}

function formatBlockerSummary(blockers: ProductDeletionBlockerResult["blockers"]) {
  return Object.entries(blockers)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${key.replaceAll("_", " ")}: ${count}`)
    .join(", ");
}

const ProductCard = memo(function ProductCard({
  product,
  menuOpen,
  isArchivedView,
  onMenuToggle,
  onEdit,
  onArchive,
  onPublishState,
  onDelete
}: {
  product: ProductCatalogGridRow;
  menuOpen: boolean;
  isArchivedView: boolean;
  onMenuToggle: (id: string) => void;
  onEdit: (product: ProductCatalogGridRow) => void;
  onArchive: (id: string) => void;
  onPublishState: (id: string, status: string, visible: boolean) => void;
  onDelete: (product: ProductCatalogGridRow) => void;
}) {
  const isLiveOnStorefront = product.status === "published" && product.isVisible;

  return (
    <article
      data-product-card
      className={`group relative flex min-h-[248px] flex-col rounded-[var(--platform-radius)] p-3 transition-[background-color] ${menuOpen ? "z-40" : "z-0"}`}
    >
      <ProductImage product={product} />

      <div className="mt-3 min-h-[72px] flex-1">
        <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
          <p className="truncate text-[11px] text-[var(--platform-text-muted)]">{product.category}</p>
          <span className={`inline-flex shrink-0 items-center gap-1 text-[10px] font-medium capitalize leading-4 ${statusClass(product.status)}`}>
            <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
            {product.status.replaceAll("_", " ")}
          </span>
        </div>
        <h3 className="line-clamp-2 text-[13px] font-medium leading-5 text-[var(--platform-text-primary)]">
          {product.title}
        </h3>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs tabular-nums">
          <p>
            <span className="text-[var(--platform-text-muted)]">Price </span>
            <span className="font-medium text-[var(--platform-text-primary)]">{formatCurrency(product.price)}</span>
          </p>
          <p>
            <span className="text-[var(--platform-text-muted)]">Stock </span>
            <span className="font-medium text-[var(--platform-text-primary)]">{product.stockQuantity} {product.stockStatus}</span>
          </p>
        </div>
      </div>

      <div className="mt-2 grid gap-1 pt-2">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_36px] items-stretch gap-1.5">
          <button
            type="button"
            data-product-row-action="edit"
            aria-label={`Edit ${product.title}`}
            title="Edit product"
            onClick={() => onEdit(product)}
            className={productActionClass}
          >
            <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Edit
          </button>
          <Link
            data-product-row-action="media"
            href={`/admin/products?product_slug=${encodeURIComponent(product.id)}&tool=media#product-media`}
            className={productActionClass}
          >
            Media
          </Link>
          <div className="relative self-stretch" data-product-row-actions-menu>
            <button
              type="button"
              aria-label={`More actions for ${product.title}`}
              aria-expanded={menuOpen}
              onClick={() => onMenuToggle(product.id)}
              className="product-row-btn grid h-8 w-9 place-items-center rounded-lg text-[var(--platform-text-primary)] transition-colors"
              data-product-row-action="menu"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </button>
            {menuOpen ? (
              <div className="absolute right-0 top-[calc(100%+0.375rem)] z-[90] grid w-44 gap-1 rounded-xl bg-[var(--platform-surface-raised)] p-2 text-xs" style={{ boxShadow: "var(--platform-shadow-md)" }}>
                <Link
                  href={`/admin/inventory?product=${encodeURIComponent(product.id)}`}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-medium text-[var(--platform-text-secondary)] hover:bg-[var(--platform-accent-soft)] hover:text-[var(--platform-text-primary)]"
                >
                  Update stock
                </Link>
                <form action={timedSaveProductDuplicateFormAction}>
                  <input type="hidden" name="product_slug" value={product.id} />
                  <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-medium text-[var(--platform-text-secondary)] hover:bg-[var(--platform-accent-soft)] hover:text-[var(--platform-text-primary)]">
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    Duplicate
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </div>

        <ProductPublishToggle
          product={product}
          isLiveOnStorefront={isLiveOnStorefront}
          onPublishState={onPublishState}
        />

        <div className={isArchivedView ? "grid grid-cols-1 gap-1.5" : "grid grid-cols-2 gap-1.5"}>
          {isArchivedView ? null : (
            <form
              action={timedSaveProductPublishStateFormAction}
              data-product-row-action="archive"
              onSubmit={() => onArchive(product.id)}
              className="min-w-0"
            >
              <input type="hidden" name="product_slug" value={product.id} />
              <input type="hidden" name="workflow_status" value="archived" />
              <input type="hidden" name="change_summary" value={`Archive product ${product.id}`} />
              <button
                type="submit"
                title="Archive product"
                className="product-row-btn inline-flex h-8 w-full items-center justify-center rounded-lg px-2 text-xs font-medium transition-colors"
                data-product-row-action="archive"
              >
                Archive
              </button>
            </form>
          )}
          <button
            type="button"
            data-product-row-action={isArchivedView ? "permanent-delete" : "remove"}
            title={isArchivedView ? "Permanently delete product" : "Remove product from catalog"}
            onClick={() => onDelete(product)}
            className="product-row-btn inline-flex h-8 w-full items-center justify-center rounded-lg px-2 text-xs font-medium transition-colors"
          >
            {isArchivedView ? "Permanent delete" : "Remove"}
          </button>
        </div>
      </div>
    </article>
  );
});

export function ProductCatalogGrid({
  rows,
  totalCount,
  statusFilter,
  canForceDelete,
  categoryOptions,
  deleteCategoryAction
}: {
  rows: ProductCatalogGridRow[];
  totalCount: number;
  statusFilter: string;
  canForceDelete: boolean;
  categoryOptions: ProductCategoryOption[];
  deleteCategoryAction: (formData: FormData) => void | Promise<void>;
}) {
  const isArchivedView = statusFilter === "archived";
  const [productOverrides, setProductOverrides] = useState<Record<string, Partial<ProductCatalogGridRow>>>({});
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<ProductCatalogGridRow | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<ProductCatalogGridRow | null>(null);
  const [deleteBlockers, setDeleteBlockers] = useState<ProductDeletionBlockerResult | null>(null);
  const [forceDeleteConfirmed, setForceDeleteConfirmed] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 24;
  const products = useMemo(
    () => rows.map((product) => ({ ...product, ...(productOverrides[product.id] ?? {}) })),
    [rows, productOverrides]
  );
  const visibleProducts = useMemo(() => products.slice(0, page * pageSize), [page, products]);
  const adjustedTotalCount = Math.max(totalCount, products.length);

  useEffect(() => {
    if (!deleteProduct) {
      setDeleteBlockers(null);
      setForceDeleteConfirmed(false);
      return;
    }

    let cancelled = false;
    previewProductDeleteAction(deleteProduct.id)
      .then((result) => {
        if (!cancelled) setDeleteBlockers(result);
      })
      .catch(() => {
        if (!cancelled) setDeleteBlockers(null);
        notify.error("Failed to load delete details.", { source: "admin", id: "product:delete-preview" });
      });

    return () => {
      cancelled = true;
    };
  }, [deleteProduct]);

  function updateProduct(id: string, fields: Partial<ProductCatalogGridRow>) {
    setProductOverrides((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? {}),
        ...fields
      }
    }));
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--platform-text-muted)]">
        <span>
          Showing {String(visibleProducts.length)} of {String(adjustedTotalCount)} products
        </span>
      </div>
      <div
        id="product-list"
        data-product-operational-grid
        data-product-stock-visibility
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5 gap-4"
      >
        {visibleProducts.length ? visibleProducts.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            isArchivedView={isArchivedView}
            menuOpen={openMenuId === product.id}
            onMenuToggle={(id) => setOpenMenuId((current) => current === id ? null : id)}
            onEdit={(nextProduct) => {
              setOpenMenuId(null);
              setEditingProduct(nextProduct);
            }}
            onArchive={(id) => {
              setOpenMenuId(null);
              updateProduct(id, { status: "archived", isVisible: false });
            }}
            onPublishState={(id, status, visible) => {
              setOpenMenuId(null);
              updateProduct(id, { status, isVisible: visible });
            }}
            onDelete={(nextProduct) => {
              setOpenMenuId(null);
              setDeleteProduct(nextProduct);
            }}
          />
        )) : (
          <div className="rounded-xl bg-[var(--platform-surface)] p-4 text-sm text-[var(--platform-text-muted)] md:col-span-2 xl:col-span-4">
            No products match the current filters.
          </div>
        )}
      </div>
      {visibleProducts.length < products.length ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setPage((current) => current + 1)}
            className="rounded-lg border border-transparent bg-[var(--platform-surface-muted)] px-4 py-2 text-xs font-medium text-[var(--platform-text-secondary)] hover:bg-[var(--platform-accent-soft)]"
          >
            Load more products
          </button>
        </div>
      ) : null}

      {editingProduct ? (
        <ProductDetailEditDialog
          product={editingProduct}
          categoryOptions={categoryOptions}
          deleteCategoryAction={deleteCategoryAction}
          onClose={() => setEditingProduct(null)}
          onSaved={(fields) => updateProduct(editingProduct.id, fields)}
        />
      ) : null}

      {deleteProduct ? (
        <div data-product-delete-modal className="fixed inset-0 z-50 grid place-items-center bg-[color-mix(in_srgb,var(--platform-bg)_72%,transparent)] p-4 backdrop-blur-[2px]">
          <form
            action={
              isArchivedView && forceDeleteConfirmed
                ? timedSaveProductForceDeleteFormAction
                : isArchivedView
                  ? timedSaveProductHardDeleteFormAction
                  : timedSaveProductRemoveFormAction
            }
            className="w-full max-w-md rounded-2xl border border-[var(--platform-border)] bg-[var(--platform-surface)] p-5"
            style={{ boxShadow: "var(--platform-shadow-md)" }}
          >
            <input type="hidden" name="product_slug" value={deleteProduct.id} />
            <input type="hidden" name="confirm_slug" value={deleteProduct.id} />
            <input
              type="hidden"
              name="change_summary"
              value={
                isArchivedView && forceDeleteConfirmed
                  ? `Force delete product ${deleteProduct.id} from archived catalog`
                  : isArchivedView
                    ? `Permanently delete product ${deleteProduct.id} from archived catalog`
                    : `Remove product ${deleteProduct.id} from catalog grid`
              }
            />
            {isArchivedView && forceDeleteConfirmed ? <input type="hidden" name="force_delete" value="1" /> : null}
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--platform-danger)]">
              {isArchivedView ? "Permanent delete" : "Remove product"}
            </p>
            <h2 className="mt-2 text-lg font-medium text-[var(--platform-text-primary)]">{deleteProduct.title}</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--platform-text-muted)]">
              {isArchivedView
                ? "This permanently deletes the archived product from the database. This action cannot be undone."
                : "Removes the product from the storefront. Products with stock or operational history are archived instead of destroyed."}
            </p>
            {deleteBlockers?.hasBlockers ? (
              <p className="mt-3 rounded-lg bg-[var(--platform-surface-muted)] px-3 py-2 text-xs leading-5 text-[var(--platform-text-secondary)]">
                {isArchivedView
                  ? `Operational references block permanent delete: ${formatBlockerSummary(deleteBlockers.blockers)}.`
                  : `This product has operational references (${formatBlockerSummary(deleteBlockers.blockers)}). It will be archived, not destroyed.`}
              </p>
            ) : isArchivedView ? (
              <p className="mt-3 rounded-lg bg-[var(--platform-surface-muted)] px-3 py-2 text-xs leading-5 text-[var(--platform-text-secondary)]">
                No operational references were found. Permanent delete is allowed.
              </p>
            ) : null}
            {isArchivedView && canForceDelete && deleteBlockers?.hasBlockers ? (
              <label className="mt-4 flex items-start gap-2 text-xs leading-5 text-[var(--platform-text-secondary)]">
                <input
                  type="checkbox"
                  checked={forceDeleteConfirmed}
                  onChange={(event) => setForceDeleteConfirmed(event.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Force delete despite operational references. Order and shipment history still block force delete.
                </span>
              </label>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteProduct(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--platform-text-secondary)] hover:bg-[var(--platform-accent-soft)]">
                Cancel
              </button>
              <button
                className="rounded-lg bg-[var(--platform-danger-soft)] px-4 py-2 text-sm font-medium text-[var(--platform-danger)] hover:bg-[var(--platform-danger-soft)]"
                disabled={isArchivedView && Boolean(deleteBlockers?.hasBlockers) && !forceDeleteConfirmed}
              >
                {isArchivedView
                  ? forceDeleteConfirmed
                    ? "Force delete product"
                    : "Permanently delete"
                  : "Remove product"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
