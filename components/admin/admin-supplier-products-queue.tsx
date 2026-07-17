"use client";

import Image from "next/image";
import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useOptionalAdminRealtime } from "@/components/admin/realtime/admin-realtime-provider";
import {
  approveProductSubmissionFormAction,
  rejectProductSubmissionFormAction,
  type SupplierProductActionResult
} from "@/app/admin/suppliers/products/actions";
import { AdminSection } from "@/components/admin/module-panel";
import { OperationalSubmitButton } from "@/components/admin/operational-submit-button";
import { EditorRenderedContent } from "@/components/editor/editor-rendered-content";
import { StatusPill } from "@/components/platform";
import { wrapServerAction } from "@/hooks/use-async-action";
import { resolveNextImageSrc } from "@/lib/media/next-image-src";
import { notify } from "@/lib/feedback/notify";
import { markControlPlaneLiveSyncFlush } from "@/lib/control-plane/shared-live-sync-coordinator";
import { formatINR } from "@/lib/utils";

export type PendingProductGalleryItem = {
  src: string;
  alt?: string;
};

export type PendingProduct = {
  slug: string;
  name: string;
  category: string;
  price: number;
  supplier_id: string | null;
  supplier_label: string;
  workflow_status: string;
  updated_at: string;
  description: string | null;
  thumbnailSrc: string | null;
  galleryItems: PendingProductGalleryItem[];
};

type AdminSupplierProductsQueueProps = {
  products: PendingProduct[];
  pendingCount: number;
  defaultWarehouseCode: string;
  supplierFilter?: string;
};

function feedbackFromResult(result: SupplierProductActionResult) {
  if (result.status === "success") {
    notify.success(result.message, { source: "admin-supplier-products" });
    return;
  }
  if (result.status === "conflict") {
    notify.warning(result.message, { source: "admin-supplier-products" });
    return;
  }
  notify.error(result.message, { source: "admin-supplier-products" });
}

export function AdminSupplierProductsQueue({
  products,
  pendingCount,
  defaultWarehouseCode,
  supplierFilter
}: AdminSupplierProductsQueueProps) {
  const router = useRouter();
  const realtime = useOptionalAdminRealtime();
  const [, startTransition] = useTransition();
  const [optimisticProducts, removeProduct] = useOptimistic(products, (state, slug: string) =>
    state.filter((product) => product.slug !== slug)
  );

  async function runProductAction(
    action: (formData: FormData) => Promise<SupplierProductActionResult>,
    formData: FormData
  ) {
    const slug = String(formData.get("slug") ?? "").trim();
    startTransition(() => {
      if (slug) removeProduct(slug);
    });

    const result = await wrapServerAction(action, { label: "Review supplier product" })(formData);
    feedbackFromResult(result);

    if (result.ok) {
      const params = new URLSearchParams();
      if (supplierFilter) params.set("supplier", supplierFilter);
      markControlPlaneLiveSyncFlush();
      void realtime?.reconcileResources(["suppliers"]);
      if (supplierFilter) {
        router.replace(`/admin/suppliers/products?supplier=${encodeURIComponent(supplierFilter)}`);
      }
      return;
    }

    void realtime?.reconcileResources(["suppliers"]);
  }

  return (
    <AdminSection
      title="Pending product submissions"
      description={`${Math.max(pendingCount - (products.length - optimisticProducts.length), optimisticProducts.length)} item${optimisticProducts.length === 1 ? "" : "s"} awaiting review`}
      actions={optimisticProducts.length > 0 ? <StatusPill status="pending_review" /> : undefined}
    >
      <div className="grid gap-2">
        {optimisticProducts.length ? optimisticProducts.map((product) => {
          const missingSupplier = !product.supplier_id;
          return (
            <article
              key={product.slug}
              className="rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] p-4 transition-colors hover:bg-[var(--platform-surface-raised)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-medium text-[var(--platform-text-primary)]">{product.name}</h2>
                    <StatusPill status={product.workflow_status} />
                  </div>
                  <p className="mt-1 text-sm text-[var(--platform-text-muted)]">
                    {product.category} · {formatINR(product.price)}
                  </p>
                  <p className="mt-1 text-xs text-[var(--platform-text-muted)]">Supplier: {product.supplier_label}</p>
                  {missingSupplier ? (
                    <p className="mt-2 text-xs text-[var(--platform-warning)]">
                      Missing supplier owner — reject this submission or fix supplier_id before approval.
                    </p>
                  ) : null}
                  <div className="mt-4 grid gap-4 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.06em] text-[var(--platform-text-muted)]">Submission preview</p>
                    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                      <div className="grid gap-3">
                        <div className="relative aspect-[4/3] overflow-hidden rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)]">
                          {product.thumbnailSrc ? (
                            <Image
                              src={product.thumbnailSrc}
                              alt={product.name}
                              fill
                              sizes="220px"
                              className="object-contain p-3"
                            />
                          ) : (
                            <div className="grid h-full place-items-center text-sm text-[var(--platform-text-muted)]">
                              No image
                            </div>
                          )}
                        </div>
                        {product.galleryItems.length ? (
                          <div className="grid gap-2">
                            <p className="text-xs text-[var(--platform-text-muted)]">Gallery</p>
                            <div className="flex flex-wrap gap-2">
                              {product.galleryItems.map((item) => {
                                const gallerySrc = resolveNextImageSrc(item.src);
                                if (!gallerySrc) return null;
                                return (
                                  <div
                                    key={item.src}
                                    className="relative h-16 w-16 overflow-hidden rounded-[6px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)]"
                                  >
                                    <Image
                                      src={gallerySrc}
                                      alt={item.alt || product.name}
                                      fill
                                      sizes="64px"
                                      className="object-cover"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-[var(--platform-text-muted)]">Description</p>
                        {product.description ? (
                          <div className="mt-2 max-h-64 overflow-y-auto rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] p-3 text-sm leading-relaxed text-[var(--platform-text-secondary)]">
                            <EditorRenderedContent html={product.description} />
                          </div>
                        ) : (
                          <p className="mt-2 text-sm text-[var(--platform-text-muted)]">No description provided.</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <form
                    action={(formData) => runProductAction(approveProductSubmissionFormAction, formData)}
                    className="mt-4 grid gap-3 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4"
                  >
                    <input type="hidden" name="slug" value={product.slug} />
                    <input type="hidden" name="expected_updated_at" value={product.updated_at} />
                    <p className="text-xs font-medium uppercase tracking-[0.06em] text-[var(--platform-text-muted)]">Inventory on approval</p>
                    <p className="text-xs text-[var(--platform-text-muted)]">
                      Set initial stock in admin inventory when approving. Leave quantity at 0 to publish without stock.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-1 text-sm">
                        <span className="text-[var(--platform-text-secondary)]">SKU</span>
                        <input
                          name="approval_sku"
                          defaultValue=""
                          className="h-9 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-3 text-sm text-[var(--platform-text-primary)]"
                        />
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span className="text-[var(--platform-text-secondary)]">Warehouse</span>
                        <input
                          name="approval_warehouse_code"
                          defaultValue={defaultWarehouseCode}
                          className="h-9 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-3 text-sm text-[var(--platform-text-primary)]"
                        />
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span className="text-[var(--platform-text-secondary)]">Starting quantity</span>
                        <input
                          name="approval_initial_quantity"
                          type="number"
                          min={0}
                          defaultValue={0}
                          className="h-9 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-3 text-sm text-[var(--platform-text-primary)]"
                        />
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span className="text-[var(--platform-text-secondary)]">Reorder threshold</span>
                        <input
                          name="approval_reorder_threshold"
                          type="number"
                          min={0}
                          defaultValue={0}
                          className="h-9 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-3 text-sm text-[var(--platform-text-primary)]"
                        />
                      </label>
                    </div>
                    <textarea
                      name="approval_stock_notes"
                      rows={2}
                      placeholder="Optional stock notes"
                      className="rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-3 py-2 text-sm text-[var(--platform-text-primary)]"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <OperationalSubmitButton
                        pendingLabel="Approving"
                        disabled={missingSupplier}
                        className="platform-btn-primary h-9 rounded-[8px] px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Approve
                      </OperationalSubmitButton>
                    </div>
                  </form>
                </div>
                <form
                  action={(formData) => runProductAction(rejectProductSubmissionFormAction, formData)}
                  className="flex flex-wrap items-center gap-2"
                >
                  <input type="hidden" name="slug" value={product.slug} />
                  <input type="hidden" name="expected_updated_at" value={product.updated_at} />
                  <input
                    name="rejection_reason"
                    required
                    placeholder="Rejection reason"
                    className="h-9 min-w-[180px] rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)] px-3 text-sm text-[var(--platform-text-primary)] outline-none focus:border-[var(--platform-accent)]/35 focus:ring-2 focus:ring-[var(--platform-accent)]/10"
                  />
                  <OperationalSubmitButton
                    pendingLabel="Rejecting"
                    className="inline-flex h-9 items-center rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface)] px-3 text-sm font-medium text-[var(--platform-danger)] transition hover:bg-[var(--platform-danger-soft)]"
                  >
                    Reject
                  </OperationalSubmitButton>
                </form>
              </div>
            </article>
          );
        }) : (
          <p className="rounded-[8px] border border-dashed border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-4 py-8 text-center text-sm text-[var(--platform-text-muted)]">
            No products waiting for approval.
          </p>
        )}
      </div>
    </AdminSection>
  );
}
