import Link from "next/link";
import { AdminSection } from "@/components/admin/module-panel";
import { SupplierLiveSync } from "@/components/supplier/supplier-live-sync";
import { StatusPill } from "@/components/platform";
import { relativeTimeLabel, supplierEmptyMessage } from "@/lib/platform/copy";
import { listSupplierInventory, listSupplierProducts } from "@/services/supplier-actions";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";
import { getCurrentAuthContext } from "@/services/auth";
import type { SupplierInventoryItem, SupplierProduct } from "@/lib/supplier/types";

function productStatus(product: SupplierProduct) {
  return product.workflowStatus ?? "draft";
}

function productSlug(product: SupplierProduct) {
  return product.slug ?? "";
}

function productName(product: SupplierProduct) {
  return product.name || productSlug(product);
}

function AttentionRow({
  title,
  detail,
  href,
  actionLabel
}: {
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-amber-500/30 bg-amber-950/15 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--platform-text-primary)]">{title}</p>
        <p className="mt-0.5 text-xs text-[var(--platform-text-muted)]">{detail}</p>
      </div>
      <Link href={href} className="text-sm font-medium text-[var(--platform-accent)]">
        {actionLabel}
      </Link>
    </div>
  );
}

function ProductRowLink({
  product,
  actionLabel
}: {
  product: SupplierProduct;
  actionLabel: string;
}) {
  const slug = productSlug(product);
  const status = productStatus(product);
  const updated = product.updatedAt ? relativeTimeLabel(product.updatedAt) : "";
  const href = actionLabel === "View listing" && status === "published"
    ? `/product/${encodeURIComponent(slug)}`
    : `/supplier/products/${encodeURIComponent(slug)}/edit`;
  const opensStorefront = href.startsWith("/product/");

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--platform-text-primary)]">{productName(product)}</p>
        {updated ? <p className="mt-0.5 text-xs text-[var(--platform-text-muted)]">Updated {updated}</p> : null}
      </div>
      <div className="flex items-center gap-2">
        <StatusPill status={status} />
        <Link
          href={href}
          target={opensStorefront ? "_blank" : undefined}
          rel={opensStorefront ? "noreferrer" : undefined}
          className="text-sm text-[var(--platform-accent)]"
        >
          {actionLabel}
        </Link>
      </div>
    </div>
  );
}

export default async function SupplierDashboardPage() {
  const [context, policy] = await Promise.all([
    getCurrentAuthContext(),
    getAdminSettingsPolicy()
  ]);
  const products = context.userId ? await listSupplierProducts(context.userId) : [];
  const inventory = context.userId ? await listSupplierInventory(context.userId, process.env, products) : [];

  if (!products.length) {
    return (
      <div className="grid gap-5">
        <SupplierLiveSync enabled={policy.realtimeUpdatesEnabled} />
        <p className="max-w-3xl text-sm leading-relaxed text-[var(--platform-text-secondary)]">
          Manage your product listings, send them for review, and keep track of stock levels. Start by adding your first product.
        </p>
        <AdminSection title="Get started" description="Add your first product to begin selling through Mithron.">
          <div className="grid gap-4">
            <p className="text-sm text-[var(--platform-text-secondary)]">{supplierEmptyMessage("products")}</p>
            <Link
              href="/supplier/products/new"
              className="platform-btn-primary h-10 w-fit rounded-[8px] px-4 text-sm font-medium"
            >
              Add your first product
            </Link>
          </div>
        </AdminSection>
      </div>
    );
  }

  const drafts = products.filter((product) => productStatus(product) === "draft");
  const rejected = products.filter((product) => productStatus(product) === "rejected");
  const pending = products.filter((product) => productStatus(product) === "pending_review");
  const published = products
    .filter((product) => productStatus(product) === "published")
    .sort((left, right) => Date.parse(String(right.updatedAt ?? "")) - Date.parse(String(left.updatedAt ?? "")))
    .slice(0, 5);

  const lowStock = inventory.filter((row: SupplierInventoryItem) => {
    const status = row.stockStatus;
    return status === "low_stock" || status === "out_of_stock";
  });

  const nameBySlug = new Map(products.map((product) => [productSlug(product), productName(product)]));
  const stockCounts = inventory.reduce(
    (acc, row: SupplierInventoryItem) => {
      const status = row.stockStatus || "available";
      if (status === "low_stock") acc.low += 1;
      else if (status === "out_of_stock") acc.out += 1;
      else acc.inStock += 1;
      return acc;
    },
    { inStock: 0, low: 0, out: 0 }
  );

  const attentionItems: Array<{ key: string; title: string; detail: string; href: string; actionLabel: string }> = [
    ...drafts.map((product) => ({
      key: `draft-${productSlug(product)}`,
      title: productName(product),
      detail: "Ready to send for review.",
      href: `/supplier/products/${encodeURIComponent(productSlug(product))}/edit`,
      actionLabel: "Send for review"
    })),
    ...rejected.map((product) => ({
      key: `rejected-${productSlug(product)}`,
      title: productName(product),
      detail: product.rejectionReason && product.rejectionReason.trim()
        ? product.rejectionReason.trim().slice(0, 120)
        : "Changes requested by our team.",
      href: `/supplier/products/${encodeURIComponent(productSlug(product))}/edit`,
      actionLabel: "Update product"
    })),
    ...lowStock.map((row: SupplierInventoryItem) => ({
      key: `stock-${row.id || row.productSlug}`,
      title: row.productName || nameBySlug.get(row.productSlug) || "Product",
      detail: row.stockStatus === "out_of_stock" ? "Out of stock — request a stock update." : "Low stock — review your quantities.",
      href: "/supplier/inventory",
      actionLabel: "View stock"
    }))
  ];

  return (
    <div className="grid gap-5">
      <SupplierLiveSync enabled={policy.realtimeUpdatesEnabled} />
      <p className="max-w-3xl text-sm leading-relaxed text-[var(--platform-text-secondary)]">
        Manage your product listings, track review progress, and monitor stock levels. Items that need your attention appear first.
      </p>

      {attentionItems.length ? (
        <AdminSection title="Needs your attention" description="Products and stock items that require action.">
          <div className="grid gap-2">
            {attentionItems.map((item) => (
              <AttentionRow key={item.key} title={item.title} detail={item.detail} href={item.href} actionLabel={item.actionLabel} />
            ))}
          </div>
        </AdminSection>
      ) : null}

      {pending.length ? (
        <AdminSection title="Awaiting review" description="Products our team is currently reviewing.">
          <div className="grid gap-2">
            {pending.slice(0, 5).map((product) => (
              <ProductRowLink key={productSlug(product)} product={product} actionLabel="View" />
            ))}
          </div>
        </AdminSection>
      ) : null}

      {rejected.length ? (
        <AdminSection title="Changes requested" description="Update these products and send them back for review.">
          <div className="grid gap-2">
            {rejected.slice(0, 5).map((product) => (
              <ProductRowLink key={productSlug(product)} product={product} actionLabel="Review feedback" />
            ))}
          </div>
        </AdminSection>
      ) : null}

      {published.length ? (
        <AdminSection title="Recently live" description="Products approved and visible on the store.">
          <div className="grid gap-2">
            {published.map((product) => (
              <ProductRowLink key={productSlug(product)} product={product} actionLabel="View listing" />
            ))}
          </div>
        </AdminSection>
      ) : null}

      {inventory.length ? (
        <AdminSection
          title="Stock summary"
          description={
            stockCounts.low > 0 || stockCounts.out > 0
              ? "Some products need stock attention."
              : "Current stock levels across your products."
          }
        >
          <div className="flex flex-wrap items-center gap-4 text-sm text-[var(--platform-text-secondary)]">
            <span><strong className="text-[var(--platform-text-primary)]">{stockCounts.inStock}</strong> in stock</span>
            {stockCounts.low > 0 ? (
              <span><strong className="text-amber-300">{stockCounts.low}</strong> low stock</span>
            ) : null}
            {stockCounts.out > 0 ? (
              <span><strong className="text-rose-300">{stockCounts.out}</strong> out of stock</span>
            ) : null}
            {stockCounts.low > 0 || stockCounts.out > 0 ? (
              <Link href="/supplier/inventory" className="text-[var(--platform-accent)]">
                Review stock levels
              </Link>
            ) : null}
          </div>
        </AdminSection>
      ) : null}
    </div>
  );
}
