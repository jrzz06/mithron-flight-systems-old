"use client";

import { wrapServerAction } from "@/hooks/use-async-action";

import { useMemo } from "react";
import {
  createCustomerReviewAdminFormAction,
  deleteCustomerReviewAdminFormAction,
  publishCustomerReviewFormAction,
  rejectCustomerReviewFormAction,
  toggleCustomerReviewVisibilityFormAction,
  updateCustomerReviewAdminFormAction
} from "@/app/admin/reviews/actions";
import { StatusBadge } from "@/components/admin/module-panel";
import { useAdminLiveCollectionRows } from "@/components/admin/realtime/use-admin-live-collection-rows";
import type { CustomerProductReview } from "@/services/customer-product-reviews";
import type { AdminEntityRow } from "@/lib/admin/realtime/admin-entity-store";

const timedCreateCustomerReviewAdminFormAction = wrapServerAction(createCustomerReviewAdminFormAction, { label: "Create review" });
const timedPublishCustomerReviewFormAction = wrapServerAction(publishCustomerReviewFormAction, { label: "Publish review" });
const timedRejectCustomerReviewFormAction = wrapServerAction(rejectCustomerReviewFormAction, { label: "Reject review" });
const timedToggleCustomerReviewVisibilityFormAction = wrapServerAction(toggleCustomerReviewVisibilityFormAction, { label: "Toggle review visibility" });
const timedDeleteCustomerReviewAdminFormAction = wrapServerAction(deleteCustomerReviewAdminFormAction, { label: "Delete review" });
const timedUpdateCustomerReviewAdminFormAction = wrapServerAction(updateCustomerReviewAdminFormAction, { label: "Update review" });

function formatDate(value: string) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Intl.DateTimeFormat("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(parsed);
}

type ProductOption = { slug: string; name: string };

export function AdminProductReviewQueue({
  reviews,
  products,
  showCreate = false
}: {
  reviews: CustomerProductReview[];
  products: ProductOption[];
  showCreate?: boolean;
}) {
  const liveReviews = useAdminLiveCollectionRows(
    "reviews",
    "customer_order_reviews",
    reviews as unknown as AdminEntityRow[],
    ["id"]
  ) as unknown as CustomerProductReview[];

  const productLabel = useMemo(() => {
    const map = new Map(products.map((product) => [product.slug, product.name]));
    return (slug: string) => map.get(slug) || slug;
  }, [products]);

  return (
    <div className="grid gap-4" data-admin-product-review-queue>
      {showCreate ? (
        <article className="rounded-[12px] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-5">
          <h2 className="text-base font-semibold text-[var(--platform-ink)]">Add customer review</h2>
          <p className="mt-1 text-sm text-[var(--platform-muted)]">Name, product, and description — that is all.</p>
          <form action={timedCreateCustomerReviewAdminFormAction} className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Name</span>
              <input name="customer_name" required className="platform-input" placeholder="Customer name" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Product</span>
              <select name="product_slug" required className="platform-input" defaultValue="">
                <option value="" disabled>
                  Select a product
                </option>
                {products.map((product) => (
                  <option key={product.slug} value={product.slug}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Description</span>
              <textarea name="body" required rows={4} className="platform-input" placeholder="What they said…" />
            </label>
            <div>
              <button type="submit" className="platform-button platform-button-primary">
                Save review
              </button>
            </div>
          </form>
        </article>
      ) : null}

      {!liveReviews.length ? (
        <div className="rounded-[12px] border border-[var(--platform-border)] bg-[var(--platform-surface)] px-5 py-8 text-sm text-[var(--platform-muted)]">
          No customer reviews match the current filters.
        </div>
      ) : (
        liveReviews.map((review) => (
          <article
            key={review.id}
            className="rounded-[12px] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-[var(--platform-ink)]">{review.customerName}</h2>
                  <StatusBadge status={review.status} />
                  {!review.isVisible ? (
                    <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-rose-400">
                      Hidden
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-[var(--platform-muted)]">
                  {productLabel(review.productSlug)} · {formatDate(review.createdAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {review.status === "pending" ? (
                  <>
                    <form action={timedPublishCustomerReviewFormAction}>
                      <input type="hidden" name="id" value={review.id} />
                      <input type="hidden" name="product_slug" value={review.productSlug} />
                      <button type="submit" className="platform-button platform-button-primary">
                        Publish
                      </button>
                    </form>
                    <form action={timedRejectCustomerReviewFormAction}>
                      <input type="hidden" name="id" value={review.id} />
                      <input type="hidden" name="product_slug" value={review.productSlug} />
                      <button type="submit" className="platform-button platform-button-secondary">
                        Reject
                      </button>
                    </form>
                  </>
                ) : null}
                <form action={timedToggleCustomerReviewVisibilityFormAction}>
                  <input type="hidden" name="id" value={review.id} />
                  <input type="hidden" name="product_slug" value={review.productSlug} />
                  <input type="hidden" name="is_visible" value={review.isVisible ? "false" : "true"} />
                  <button type="submit" className="platform-button platform-button-secondary">
                    {review.isVisible ? "Hide" : "Show"}
                  </button>
                </form>
                <form action={timedDeleteCustomerReviewAdminFormAction}>
                  <input type="hidden" name="id" value={review.id} />
                  <input type="hidden" name="product_slug" value={review.productSlug} />
                  <button type="submit" className="platform-button platform-button-danger">
                    Delete
                  </button>
                </form>
              </div>
            </div>

            <form action={timedUpdateCustomerReviewAdminFormAction} className="mt-5 grid gap-3 border-t border-[var(--platform-border)] pt-4">
              <input type="hidden" name="id" value={review.id} />
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Name</span>
                <input name="customer_name" defaultValue={review.customerName} required className="platform-input" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Product</span>
                <select name="product_slug" defaultValue={review.productSlug} required className="platform-input">
                  {!products.some((product) => product.slug === review.productSlug) ? (
                    <option value={review.productSlug}>{review.productSlug}</option>
                  ) : null}
                  {products.map((product) => (
                    <option key={product.slug} value={product.slug}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Description</span>
                <textarea name="body" defaultValue={review.body} required rows={4} className="platform-input" />
              </label>
              <div>
                <button type="submit" className="platform-button platform-button-secondary">
                  Save changes
                </button>
              </div>
            </form>
          </article>
        ))
      )}
    </div>
  );
}
