import Link from "next/link";
import { DataList, ModulePanel, OperationalFeedback, StatusBadge } from "@/components/admin/module-panel";
import { AdminProductsLiveSync } from "@/components/admin/admin-products-live-sync";
import { AdminProductsLiveWorkspace } from "@/components/admin/admin-products-live-workspace";
import { FormField, Input, Select } from "@/components/platform";
import { OperationalSubmitButton } from "@/components/admin/operational-submit-button";
import { TimedActionForm } from "@/components/admin/timed-action-form";
import { getProductManagerSnapshot, fetchProductEditorDetail } from "@/services/admin";
import { getCurrentAuthContext } from "@/services/auth";
import { roleHasPermission } from "@/lib/auth/permissions";
import { deleteProductCategoryFormAction, saveProductCategoryFormAction, saveProductDraftFormAction, saveProductInventoryWorkflowFormAction, saveProductMediaLinkFormAction, saveProductPublishStateFormAction, saveProductSeoFormAction, saveProductVariantsFormAction } from "./actions";
import { resolveNextImageSrc } from "@/lib/media/next-image-src";
import { type ProductCatalogGridRow } from "./product-catalog-grid";
import { ProductCategoryField, type ProductCategoryOption } from "./product-category-field";
import { buildProductCategoryOptions } from "@/lib/product-category-options";
import { connectivityMessage, emptyMessage } from "@/lib/platform/copy";
import { ProductCreateDetailFields } from "./product-create-detail-fields";
import { ProductMultiImageField } from "@/components/products/product-multi-image-field";
import { WarehouseCodeSelect } from "@/components/warehouse/warehouse-code-select";
import { deriveProductSku } from "@/lib/product-sku";
import { getCheckoutWarehouseCode } from "@/services/warehouse-config";
import { listActiveWarehouses } from "@/services/warehouses";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";

const platformLabelClass = "text-xs text-[var(--platform-text-muted)]";
const platformFieldClass =
  "h-10 w-full rounded-[10px] border-0 bg-[var(--platform-surface-muted)]/60 px-3 text-sm text-[var(--platform-text-primary)] outline-none placeholder:text-[var(--platform-text-muted)] focus:bg-[var(--platform-surface-muted)] focus:ring-2 focus:ring-[var(--platform-focus-ring)]";
const platformToolClass = (active: boolean) =>
  `inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium transition-colors ${
    active
      ? "text-[var(--platform-text-primary)]"
      : "text-[var(--platform-text-secondary)] hover:text-[var(--platform-text-primary)]"
  }`;
const platformToolPillClass = (active: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
    active
      ? "text-[var(--platform-text-primary)]"
      : "text-[var(--platform-text-muted)] hover:text-[var(--platform-text-secondary)]"
  }`;
const platformPanelClass = "scroll-mt-24 overflow-hidden rounded-[var(--platform-radius)]";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function searchValue(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function readMediaSrc(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const src = (value as Record<string, unknown>).src ?? (value as Record<string, unknown>).url;
  return typeof src === "string" && src.trim() ? src : null;
}

function readGalleryItems(gallery: unknown): Array<{ src: string; alt?: string }> {
  if (!Array.isArray(gallery)) return [];
  const items: Array<{ src: string; alt?: string }> = [];
  const seen = new Set<string>();

  for (const item of gallery) {
    const src = readMediaSrc(item);
    if (!src || seen.has(src)) continue;
    seen.add(src);
    const alt = item && typeof item === "object" && !Array.isArray(item)
      ? String((item as Record<string, unknown>).alt ?? "").trim()
      : "";
    items.push({ src, ...(alt ? { alt } : {}) });
  }

  return items;
}

const productTools = [
  { key: "create", label: "Add product", href: "/admin/products?tool=create#create-product" },
  { key: "category", label: "Add category", href: "/admin/products?tool=category#product-category" },
  { key: "variants", label: "Variants", href: "/admin/products?tool=variants#product-variants" },
  { key: "media", label: "Media", href: "/admin/products?tool=media#product-media" },
  { key: "seo", label: "SEO", href: "/admin/products?tool=seo#product-seo" },
  { key: "inventory", label: "Inventory", href: "/admin/products?tool=inventory#product-inventory" },
  { key: "publish", label: "Publish", href: "/admin/products?tool=publish#archive-product" }
] as const;

type ProductToolKey = (typeof productTools)[number]["key"];

function readProductTool(value: string): ProductToolKey | "" {
  return productTools.some((tool) => tool.key === value) ? value as ProductToolKey : "";
}

export default async function AdminProductsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = searchParams ? await searchParams : {};
  const selectedProductSlug = searchValue(params, "product_slug");
  const query = searchValue(params, "q").toLowerCase();
  const statusFilter = searchValue(params, "workflow_status") || "active";
  const pageRaw = Number(searchValue(params, "page") || "1");
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const pageSize = 120;
  const [snapshot, warehouses, checkoutWarehouseCode, editorProduct, authContext, policy] = await Promise.all([
    getProductManagerSnapshot({
      limit: pageSize,
      offset: (page - 1) * pageSize,
      q: query || undefined,
      workflowStatus: statusFilter
    }),
    listActiveWarehouses(),
    getCheckoutWarehouseCode(),
    selectedProductSlug ? fetchProductEditorDetail(selectedProductSlug) : Promise.resolve(null),
    getCurrentAuthContext(),
    getAdminSettingsPolicy()
  ]);
  const catalogMetrics = snapshot.data.catalogMetrics;
  const activeTool = readProductTool(searchValue(params, "tool").toLowerCase());
  const canForceDeleteProducts = roleHasPermission(authContext.role, "products.permanent_delete");
  const categoryOptions = buildProductCategoryOptions(snapshot.data.products, snapshot.data.categories);
  const nextCategorySortOrder = (categoryOptions.length + 1) * 10;
  const filteredProducts = snapshot.data.products.map((product) => {
    if (editorProduct && String(product.slug ?? "") === String(editorProduct.slug ?? "")) {
      return { ...product, ...editorProduct };
    }
    return product;
  });
  const filteredTotal = Number(snapshot.data.filteredTotal ?? filteredProducts.length);
  const activeProductSlug = selectedProductSlug || String(filteredProducts[0]?.slug ?? snapshot.data.products[0]?.slug ?? "");
  const activeProductSku = activeProductSlug ? deriveProductSku(activeProductSlug) : "";
  const inventoryBySlug = new Map(snapshot.data.inventory.map((row) => [String(row.product_slug ?? ""), row]));
  const productRows: ProductCatalogGridRow[] = filteredProducts.map((product) => {
    const slug = String(product.slug ?? "");
    const inventory = inventoryBySlug.get(slug);
    const status = String(product.workflow_status ?? "published");
    const stockStatus = String(inventory?.stock_status ?? "unlinked");
    const checkoutAvailable = Number(inventory?.quantity ?? 0);
    const primarySrc = readMediaSrc(product.image) ?? readMediaSrc(product.hero);
    const galleryItems = readGalleryItems(product.gallery);
    const galleryUrls = galleryItems
      .map((item) => item.src)
      .filter((src) => src !== primarySrc);
    return {
      id: slug || String(product.name ?? "product"),
      title: String(product.name ?? product.slug ?? "Product"),
      category: String(product.category ?? "Uncategorized"),
      status,
      thumbnailSrc: resolveNextImageSrc(primarySrc),
      price: String(product.price ?? "0"),
      compareAt: product.compare_at ? String(product.compare_at) : null,
      badge: product.badge_text ? String(product.badge_text) : null,
      badgeEnabled: Boolean(product.badge_text && String(product.badge_text).trim()),
      badgeText: product.badge_text ? String(product.badge_text) : null,
      badgeStyle: product.badge_style ? String(product.badge_style) : null,
      galleryUrls,
      galleryItems,
      description: product.description ? String(product.description) : null,
      descriptionJson:
        product.description_json && typeof product.description_json === "object" && !Array.isArray(product.description_json)
          ? (product.description_json as Record<string, unknown>)
          : null,
      specs: product.specs && typeof product.specs === "object" && !Array.isArray(product.specs)
        ? Object.fromEntries(
            Object.entries(product.specs as Record<string, unknown>).map(([key, value]) => [key, String(value ?? "")])
          )
        : null,
      onSale: Boolean(product.on_sale),
      discountType: product.discount_type === "percent"
        ? ("percent" as const)
        : product.discount_type === "amount"
          ? ("amount" as const)
          : null,
      discountValue: product.discount_value ? String(product.discount_value) : null,
      costOfGoods: product.cost_of_goods ? String(product.cost_of_goods) : null,
      showPricePerUnit: Boolean(product.show_price_per_unit),
      chargeTax: product.charge_tax !== false,
      taxGroup: product.tax_group ? String(product.tax_group) : "products-default",
      taxRate: product.tax_rate ? String(product.tax_rate) : null,
      taxIncluded: Boolean(product.tax_included),
      stockQuantity: String(checkoutAvailable),
      stockStatus,
      checkoutWarehouseCode,
      sourceAvailability: String(product.source_availability ?? "catalog"),
      isVisible: Boolean(product.is_visible ?? true),
      updatedAt: product.updated_at ? String(product.updated_at) : null
    };
  });
  const mediaRows = snapshot.data.mediaLinks.slice(0, 12).map((link) => ({
    label: String(link.product_slug ?? link.productSlug ?? "Product slug"),
    value: String(link.media_asset_id ?? link.mediaAssetId ?? "Media asset"),
    detail: `${String(link.usage ?? "gallery")} | primary ${String(Boolean(link.is_primary))}`
  }));
  const variantRows = snapshot.data.products.slice(0, 12).map((product) => {
    const variants = Array.isArray(product.variants) ? product.variants : [];
    return {
      label: String(product.slug ?? "Product slug"),
      value: String(variants.length),
      detail: variants.length
        ? variants
            .map((variant: Record<string, unknown>) => String(variant.name ?? variant.id ?? "Variant"))
            .slice(0, 3)
            .join(", ")
        : "No variants"
    };
  });
  const seoRows = snapshot.data.products.slice(0, 12).map((product) => ({
    label: String(product.slug ?? "Product slug"),
    value: String(product.seo_title ?? product.name ?? "SEO title"),
    detail: String(product.seo_description ?? product.tagline ?? "No SEO description")
  }));
  const publishRows = snapshot.data.products.slice(0, 12).map((product) => ({
    label: String(product.slug ?? "Product slug"),
    value: String(product.workflow_status ?? "published"),
    detail: `${String(Boolean(product.is_visible ?? true))} | published ${String(product.published_at ?? "unset")} | archived ${String(product.archived_at ?? "unset")}`
  }));
  const inventoryRows = snapshot.data.inventory.slice(0, 12).map((row) => ({
    label: `${String(row.product_slug ?? "product")}:${String(row.sku ?? "sku")}`,
    value: String(row.quantity ?? 0),
    detail: `${String(row.stock_status ?? "available")} | reserved ${String(row.reserved_quantity ?? 0)} | reorder ${String(row.reorder_threshold ?? 0)}`
  }));

  return (
    <>
      <AdminProductsLiveSync enabled={policy.realtimeUpdatesEnabled} />
      <ModulePanel
        eyebrow="Catalog"
        title="Catalog management"
        description={connectivityMessage(snapshot.blockedReason) || "Search, filter, and manage products from one workspace."}
        metrics={[
          { label: "Active products", value: String(catalogMetrics.activeProducts) },
          { label: "Archived products", value: String(catalogMetrics.archivedProducts) },
          { label: "Total products", value: String(catalogMetrics.totalProducts) }
        ]}
      >
        <div className="grid gap-5">
          <OperationalFeedback
            idle="Saved changes and errors appear here."
          />
          <form data-product-search className="grid gap-3 md:grid-cols-[minmax(0,1fr)_168px_auto] md:items-end">
            <FormField label="Search products" htmlFor="product-search-q">
              <Input id="product-search-q" name="q" defaultValue={query} placeholder="Name, slug, category" />
            </FormField>
            <FormField label="Status" htmlFor="product-search-status">
              <Select id="product-search-status" name="workflow_status" defaultValue={statusFilter || "active"} data-product-status-filter>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
                <option value="all">All</option>
              </Select>
            </FormField>
            <button className="platform-btn-primary h-10 rounded-lg px-4 text-sm font-medium">
              Filter
            </button>
          </form>
          <div data-product-create-toolbar className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                data-product-add-action
                href="/admin/products?tool=create#create-product"
                className={platformToolClass(activeTool === "create")}
              >
                Add product
              </Link>
              <Link
                data-product-add-category-shortcut
                href="/admin/products?tool=category#product-category"
                className={platformToolClass(activeTool === "category")}
              >
                Add category
              </Link>
            </div>
            <nav data-product-tool-dock className="flex flex-wrap items-center gap-1" aria-label="Product tools">
              <span className="mr-1 text-[var(--platform-text-muted)]">Tools</span>
              {productTools.filter((tool) => tool.key !== "create" && tool.key !== "category").map((tool) => (
                <Link
                  key={tool.key}
                  href={tool.href}
                  className={platformToolPillClass(activeTool === tool.key)}
                >
                  {tool.label}
                </Link>
              ))}
            </nav>
          </div>
          {activeTool === "create" ? (
            <TimedActionForm id="create-product" action={saveProductDraftFormAction} actionLabel="Create product draft" data-product-create-panel data-product-table="mithron_products" className={`${platformPanelClass} grid gap-4 pt-2`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-[var(--platform-text-muted)]">Create product</p>
                  <h2 className="mt-1 text-base font-medium text-[var(--platform-text-primary)]">Add a catalog item</h2>
                </div>
                <span className="text-xs font-medium text-[var(--platform-text-muted)]">Draft first</span>
              </div>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="grid gap-4">
                  <ProductCreateDetailFields warehouses={warehouses} defaultWarehouseCode={checkoutWarehouseCode} />
                  <div data-product-create-primary-fields className="grid gap-3">
                    <ProductCategoryField
                      categories={categoryOptions}
                      deleteCategoryAction={deleteProductCategoryFormAction}
                    />
                  </div>
                </div>
                <div data-product-create-media-fields>
                  <ProductMultiImageField
                    variant="admin"
                    labelClassName={platformLabelClass}
                    fieldClassName={platformFieldClass}
                    fileInputClassName={`${platformFieldClass} py-2 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-[var(--platform-accent-soft)] file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-[var(--platform-text-secondary)]`}
                  />
                </div>
              </div>
              <div data-product-create-submit-bar className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <p data-product-supabase-storage-note className="max-w-3xl text-xs leading-5 text-[var(--platform-text-muted)]">
                  Saves to mithron_products. Uploaded files go to the mithron-products Storage bucket, then link through media_assets and product_media_assets.
                </p>
                <input type="hidden" name="change_summary" value="Add product from admin catalog" />
                <OperationalSubmitButton pendingLabel="Adding" className="platform-btn-primary h-10 rounded-lg px-4 text-sm font-medium">
                  Add product
                </OperationalSubmitButton>
              </div>
            </TimedActionForm>
          ) : null}
          {activeTool === "category" ? (
            <TimedActionForm id="product-category" action={saveProductCategoryFormAction} actionLabel="Add product category" data-product-category-create-panel data-product-table="category_metadata" className={`${platformPanelClass} grid gap-4 pt-2`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-[var(--platform-text-muted)]">Create category</p>
                  <h2 className="mt-1 text-base font-medium text-[var(--platform-text-primary)]">Add a reusable product category</h2>
                </div>
                <span className="text-xs font-medium text-[var(--platform-text-muted)]">Direct add</span>
              </div>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
                <label data-product-category-name-input className="grid gap-1.5 text-sm">
                  <span className={platformLabelClass}>Category name</span>
                  <input name="category_title" required placeholder="Example: Payload Systems" className={platformFieldClass} />
                </label>
                <label data-product-category-route-input className="grid gap-1.5 text-sm">
                  <span className={platformLabelClass}>Route key optional</span>
                  <input name="route_key" placeholder="auto-created" className={platformFieldClass} />
                </label>
              </div>
              <div data-product-category-submit-bar className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <p className="max-w-3xl text-xs leading-5 text-[var(--platform-text-muted)]">
                  Creates only the category. No product is saved, and new products can select it after refresh.
                </p>
                <input type="hidden" name="sort_order" value={String(nextCategorySortOrder)} />
                <input type="hidden" name="status" value="published" />
                <input type="hidden" name="is_visible" value="true" />
                <OperationalSubmitButton pendingLabel="Adding category" className="platform-btn-primary h-10 rounded-lg px-4 text-sm font-medium">
                  Add category
                </OperationalSubmitButton>
              </div>
            </TimedActionForm>
          ) : null}
          <AdminProductsLiveWorkspace
            productRows={productRows}
            products={filteredProducts as Array<Record<string, unknown>>}
            totalCount={filteredTotal}
            statusFilter={statusFilter || "active"}
            canForceDelete={canForceDeleteProducts}
            categoryOptions={categoryOptions}
            deleteCategoryAction={deleteProductCategoryFormAction}
          />
        </div>
      </ModulePanel>

      {activeTool === "variants" ? (
      <ModulePanel
        eyebrow="Product setup"
        title="Variants"
        description="Update color, SKU, and image options for the selected product."
      >
        <DataList rows={variantRows.length ? variantRows : [{ label: "Product variants", value: "Unavailable", detail: connectivityMessage(snapshot.blockedReason) || emptyMessage("products") }]} />
        <TimedActionForm id="product-variants" action={saveProductVariantsFormAction} actionLabel="Save product variants" data-product-variants-table="mithron_products" className="mt-8 scroll-mt-24 grid gap-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className={platformLabelClass}>Product slug</span>
              <input name="product_slug" defaultValue={activeProductSlug} placeholder="source-agri-kisan-drone-small-8-liter" className={platformFieldClass} />
            </label>
            <div data-product-variant-rows className="grid gap-3 md:col-span-2">
              {[1, 2, 3, 4].map((row) => (
                <div key={row} className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr]">
                  <input name="variant_name" placeholder={`Variant ${row} name`} className={platformFieldClass} />
                  <input name="variant_tone" placeholder="Tone / color" className={platformFieldClass} />
                  <input name="variant_sku" placeholder="SKU" className={platformFieldClass} />
                  <input name="variant_image_src" placeholder="Variant image URL" className={platformFieldClass} />
                </div>
              ))}
            </div>
          </div>

          <label className="grid gap-2 text-sm">
            <span className={platformLabelClass}>Change summary</span>
            <input name="change_summary" defaultValue="" placeholder="Update product variants" className={platformFieldClass} />
          </label>

          <OperationalSubmitButton pendingLabel="Saving variants">Save product variants</OperationalSubmitButton>
        </TimedActionForm>
      </ModulePanel>
      ) : null}

      {activeTool === "seo" ? (
      <ModulePanel
        eyebrow="Product content"
        title="Search preview"
        description="Edit the title, description, and social preview used for this product."
      >
        <DataList rows={seoRows.length ? seoRows : [{ label: "SEO metadata", value: "Unavailable", detail: connectivityMessage(snapshot.blockedReason) || emptyMessage("products") }]} />
        <TimedActionForm id="product-seo" action={saveProductSeoFormAction} actionLabel="Save product SEO" data-product-seo-table="mithron_products" className="mt-8 scroll-mt-24 grid gap-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className={platformLabelClass}>Product slug</span>
              <input name="product_slug" defaultValue={activeProductSlug} placeholder="source-agri-kisan-drone-small-8-liter" className={platformFieldClass} />
            </label>
            <label className="grid gap-2 text-sm">
              <span className={platformLabelClass}>SEO title</span>
              <input name="seo_title" defaultValue="" placeholder="Agri Kisan Drone Small | Mithron Flight Systems" className={platformFieldClass} />
            </label>
            <label className="grid gap-2 text-sm md:col-span-2">
              <span className={platformLabelClass}>SEO description</span>
              <textarea name="seo_description" defaultValue="" rows={3} placeholder="Premium agricultural drone with modular payload delivery." className={platformFieldClass} />
            </label>
            <label className="grid gap-2 text-sm">
              <span className={platformLabelClass}>OG title</span>
              <input name="og_title" defaultValue="" placeholder="Agri Kisan Drone Small | Mithron" className={platformFieldClass} />
            </label>
            <label className="grid gap-2 text-sm">
              <span className={platformLabelClass}>OG description</span>
              <input name="og_description" defaultValue="" placeholder="Cinematic product preview for social sharing." className={platformFieldClass} />
            </label>
            <label className="grid gap-2 text-sm md:col-span-2">
              <span className={platformLabelClass}>Social image URL</span>
              <input name="og_image_src" defaultValue="" placeholder="https://.../social-preview.webp" className={platformFieldClass} />
            </label>
          </div>

          <label className="grid gap-2 text-sm">
            <span className={platformLabelClass}>Change summary</span>
            <input name="change_summary" defaultValue="" placeholder="Update product SEO metadata" className={platformFieldClass} />
          </label>

          <OperationalSubmitButton pendingLabel="Saving SEO">Save product SEO</OperationalSubmitButton>
        </TimedActionForm>
      </ModulePanel>
      ) : null}

      {activeTool === "publish" ? (
      <ModulePanel
        eyebrow="Product control"
        title="Publish state."
        description="Publish, hide, archive, or restore the selected product."
      >
        <DataList rows={publishRows.length ? publishRows : [{ label: "Publication status", value: "Unavailable", detail: connectivityMessage(snapshot.blockedReason) || emptyMessage("products") }]} />
        <div id="archive-product" className="mt-8 scroll-mt-24 grid gap-4">
          <TimedActionForm id="publish-product" action={saveProductPublishStateFormAction} actionLabel="Update product publish state" data-product-publish-table="mithron_products" className={`grid gap-5 ${platformPanelClass} p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--platform-text-muted)]">Archive / restore / publish</p>
                <p className="mt-1 text-xs leading-5 text-[var(--platform-text-muted)]">Use archived status as the normal safe delete path.</p>
              </div>
              <StatusBadge status="protected" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm">
                <span className={platformLabelClass}>Product slug</span>
                <input name="product_slug" defaultValue="" placeholder="source-agri-kisan-drone-small-8-liter" className={platformFieldClass} />
              </label>
              <label className="grid gap-2 text-sm">
                <span className={platformLabelClass}>Workflow status</span>
                <select name="workflow_status" defaultValue="published" className={platformFieldClass}>
                  <option value="draft">draft</option>
                  <option value="published">published</option>
                  <option value="archived">archived</option>
                </select>
              </label>
            </div>

            <label className="flex items-center gap-3 text-sm">
              <input name="is_visible" type="checkbox" defaultChecked className="h-4 w-4 rounded border-[var(--platform-border)] text-teal-700" />
              <span className={platformLabelClass}>Visible in storefront catalog</span>
            </label>

            <label className="grid gap-2 text-sm">
              <span className={platformLabelClass}>Change summary</span>
              <input name="change_summary" defaultValue="" placeholder="Set product publication state" className={platformFieldClass} />
            </label>

            <OperationalSubmitButton
              pendingLabel="Saving publish state"
              confirmMessage="Save this product publish, archive, or restore state?"
            >
              Save product publish state
            </OperationalSubmitButton>
          </TimedActionForm>
        </div>
      </ModulePanel>
      ) : null}

      {activeTool === "inventory" ? (
      <ModulePanel
        eyebrow="Product stock"
        title="Inventory"
        description="Connect SKU, warehouse, and stock counts for the selected product."
      >
        <DataList rows={inventoryRows.length ? inventoryRows : [{ label: "inventory", value: "0", detail: "No linked inventory rows yet." }]} />
        <TimedActionForm id="product-inventory" action={saveProductInventoryWorkflowFormAction} actionLabel="Save inventory linkage" data-product-inventory-table="inventory" className="mt-8 scroll-mt-24 grid gap-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className={platformLabelClass}>Product slug</span>
              <input name="product_slug" required defaultValue={activeProductSlug} placeholder="source-agri-kisan-drone-small-8-liter" className={platformFieldClass} />
            </label>
            <label className="grid gap-2 text-sm">
              <span className={platformLabelClass}>SKU</span>
              <input name="sku" readOnly defaultValue={activeProductSku} className={platformFieldClass} />
            </label>
            <label className="grid gap-2 text-sm">
              <span className={platformLabelClass}>Variant ID</span>
              <input name="variant_id" defaultValue="" placeholder="basic-green" className={platformFieldClass} />
            </label>
            <WarehouseCodeSelect
              warehouses={warehouses}
              defaultValue={checkoutWarehouseCode}
              className={platformFieldClass}
              label="Warehouse code"
            />
            <label className="grid gap-2 text-sm">
              <span className={platformLabelClass}>Stock status</span>
              <select name="stock_status" defaultValue="available" className={platformFieldClass}>
                <option value="available">available</option>
                <option value="low_stock">low_stock</option>
                <option value="out_of_stock">out_of_stock</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm">
              <span className={platformLabelClass}>Quantity</span>
              <input name="quantity" defaultValue="0" inputMode="numeric" className={platformFieldClass} />
            </label>
            <label className="grid gap-2 text-sm">
              <span className={platformLabelClass}>Reserved quantity</span>
              <input name="reserved_quantity" defaultValue="0" inputMode="numeric" className={platformFieldClass} />
            </label>
            <label className="grid gap-2 text-sm">
              <span className={platformLabelClass}>Reorder threshold</span>
              <input name="reorder_threshold" defaultValue="0" inputMode="numeric" className={platformFieldClass} />
            </label>
          </div>
          <p className="text-xs leading-5 text-[var(--platform-text-muted)]">
            Sellable warehouse stock is synced from quantity minus reserved. SKU is derived from the product slug.
          </p>

          <label className="grid gap-2 text-sm">
            <span className={platformLabelClass}>Change summary</span>
            <input name="change_summary" defaultValue="" placeholder="Sync product inventory linkage" className={platformFieldClass} />
          </label>

          <OperationalSubmitButton pendingLabel="Saving inventory">Save inventory linkage</OperationalSubmitButton>
        </TimedActionForm>
      </ModulePanel>
      ) : null}

      {activeTool === "media" ? (
      <ModulePanel
        eyebrow="Product assets"
        title="Media"
        description="Connect existing media assets to the selected product."
      >
        <DataList rows={mediaRows.length ? mediaRows : [{ label: "Product images", value: "Unavailable", detail: connectivityMessage(snapshot.blockedReason) || emptyMessage("media") }]} />
        <TimedActionForm id="product-media" action={saveProductMediaLinkFormAction} actionLabel="Save product media link" data-product-media-table="product_media_assets" className="mt-8 scroll-mt-24 grid gap-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className={platformLabelClass}>Product slug</span>
              <input name="product_slug" defaultValue="" placeholder="source-agri-kisan-drone-small-8-liter" className={platformFieldClass} />
            </label>
            <label className="grid gap-2 text-sm">
              <span className={platformLabelClass}>Media asset ID</span>
              <input name="media_asset_id" defaultValue="" placeholder="media-atlas" className={platformFieldClass} />
            </label>
            <label className="grid gap-2 text-sm">
              <span className={platformLabelClass}>Usage</span>
              <input name="usage" defaultValue="gallery" placeholder="gallery" className={platformFieldClass} />
            </label>
            <label className="grid gap-2 text-sm">
              <span className={platformLabelClass}>Variant ID</span>
              <input name="variant_id" defaultValue="" placeholder="8-liter-green" className={platformFieldClass} />
            </label>
            <label className="grid gap-2 text-sm">
              <span className={platformLabelClass}>Sort order</span>
              <input name="sort_order" defaultValue="0" inputMode="numeric" placeholder="0" className={platformFieldClass} />
            </label>
            <label className="grid gap-2 text-sm">
              <span className={platformLabelClass}>Alt text</span>
              <input name="alt_text" defaultValue="" placeholder="Variant-specific product media alt text" className={platformFieldClass} />
            </label>
            <label className="grid gap-2 text-sm">
              <span className={platformLabelClass}>Caption</span>
              <input name="caption" defaultValue="" placeholder="Canonical product gallery caption" className={platformFieldClass} />
            </label>
          </div>

          <label className="flex items-center gap-3 text-sm">
            <input name="is_primary" type="checkbox" className="h-4 w-4 rounded border-[var(--platform-border)] text-teal-700" />
            <span className={platformLabelClass}>Primary media asset</span>
          </label>

          <label className="grid gap-2 text-sm">
            <span className={platformLabelClass}>Change summary</span>
            <input name="change_summary" defaultValue="" placeholder="Link product media row" className={platformFieldClass} />
          </label>

          <OperationalSubmitButton pendingLabel="Saving media link">Save product media link</OperationalSubmitButton>
        </TimedActionForm>
      </ModulePanel>
      ) : null}
    </>
  );
}
