import Link from "next/link";
import { AdminProductReviewQueue } from "@/components/admin/admin-product-review-queue";
import { AdminReviewsLiveSync } from "@/components/admin/admin-reviews-live-sync";
import { getHomepageProducts } from "@/services/catalog";
import { listAdminProductReviews } from "@/services/customer-product-reviews";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const statusTabs = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "published", label: "Published" },
  { key: "rejected", label: "Rejected" }
] as const;

function searchValue(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function AdminReviewsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = searchParams ? await searchParams : {};
  const statusFilter = searchValue(params, "status") || "all";
  const productSlug = searchValue(params, "product");
  const query = searchValue(params, "q");
  const showCreate = searchValue(params, "new") === "1";

  let loadError: string | null = null;
  const [reviewsResult, products, policy] = await Promise.all([
    listAdminProductReviews({
      status: statusFilter,
      productSlug: productSlug || undefined,
      q: query || undefined
    }).catch((error: unknown) => {
      loadError = error instanceof Error ? error.message : "Could not load reviews.";
      console.error("[mithron-admin] Reviews list failed.", error);
      return [] as Awaited<ReturnType<typeof listAdminProductReviews>>;
    }),
    getHomepageProducts().catch(() => []),
    getAdminSettingsPolicy()
  ]);

  const reviews = reviewsResult;
  const productOptions = products
    .map((product) => ({ slug: product.slug, name: product.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="grid gap-4" data-admin-reviews-page>
      <AdminReviewsLiveSync enabled={policy.realtimeUpdatesEnabled} />
      {loadError ? (
        <div className="rounded-[8px] border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {loadError}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--platform-muted)]">Content</p>
          <h1 className="text-2xl font-semibold text-[var(--platform-ink)]">Customer Reviews</h1>
          <p className="mt-1 text-sm text-[var(--platform-muted)]">
            Add or edit reviews with a name, product, and description.
          </p>
        </div>
        <Link
          href="/admin/reviews?new=1"
          className="platform-btn-primary inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium"
        >
          Add review
        </Link>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Review status filters">
        {statusTabs.map((tab) => {
          const active = statusFilter === tab.key;
          const href = `/admin/reviews?status=${tab.key}${productSlug ? `&product=${encodeURIComponent(productSlug)}` : ""}${query ? `&q=${encodeURIComponent(query)}` : ""}`;
          return (
            <Link
              key={tab.key}
              href={href}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                active
                  ? "bg-[var(--platform-ink)] text-white"
                  : "border border-[var(--platform-border)] text-[var(--platform-ink)]"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <form method="get" className="grid gap-3 rounded-[12px] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4 md:grid-cols-3">
        <label className="grid gap-1 text-sm md:col-span-2">
          <span className="font-medium">Search</span>
          <input name="q" defaultValue={query} placeholder="Name or description" className="platform-input" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Product</span>
          <select name="product" defaultValue={productSlug} className="platform-input">
            <option value="">All products</option>
            {productOptions.map((product) => (
              <option key={product.slug} value={product.slug}>
                {product.name}
              </option>
            ))}
          </select>
        </label>
        <input type="hidden" name="status" value={statusFilter} />
        <div className="md:col-span-3">
          <button type="submit" className="platform-button platform-button-secondary">
            Apply filters
          </button>
        </div>
      </form>

      <AdminProductReviewQueue reviews={reviews} products={productOptions} showCreate={showCreate} />
    </div>
  );
}
