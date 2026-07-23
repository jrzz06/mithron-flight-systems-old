"use client";

import { useEffect, useState, useTransition } from "react";
import { ProductBadgeFields } from "@/components/admin/product-badge-fields";
import { ProductFieldLabel } from "@/components/admin/product-info-tooltip";
import { ProductPricingFields } from "@/components/admin/product-pricing-fields";
import { ProductSpecFields } from "@/components/admin/product-spec-fields";
import { ProductTaxFields } from "@/components/admin/product-tax-fields";
import { ProductMultiImageField } from "@/components/products/product-multi-image-field";
import { RichTextEditor } from "@/components/editor/RichTextEditor/lazy";
import type { ProductCatalogGridRow } from "@/app/admin/products/product-catalog-grid";
import {
  fetchProductEditorDetailForQuickEditAction,
  saveProductQuickEditClientAction
} from "@/app/admin/products/actions";
import { ProductCategoryField, type ProductCategoryOption } from "@/app/admin/products/product-category-field";
import { FEEDBACK_MESSAGES } from "@/lib/feedback/messages";
import { notify } from "@/lib/feedback/notify";
import { raceWithTimeout } from "@/lib/fetch-with-timeout";

export function ProductDetailEditDialog({
  product,
  categoryOptions,
  deleteCategoryAction,
  onClose
}: {
  product: ProductCatalogGridRow;
  categoryOptions: ProductCategoryOption[];
  deleteCategoryAction: (formData: FormData) => void | Promise<void>;
  onClose: () => void;
  /** @deprecated Optimistic updates before save complete — unused; catalog refreshes after save. */
  onSaved?: (fields: Partial<ProductCatalogGridRow>) => void;
}) {
  const [isSaving, startTransition] = useTransition();
  const [editorProduct, setEditorProduct] = useState<ProductCatalogGridRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    setEditorProduct(null);

    void (async () => {
      try {
        const result = await raceWithTimeout(
          fetchProductEditorDetailForQuickEditAction(product.id),
          undefined,
          "Load product editor"
        );
        if (cancelled) return;
        if (!result.ok) {
          setLoadError(result.message || "Failed to load product details.");
          setIsLoading(false);
          return;
        }
        setEditorProduct({
          ...product,
          ...result.product,
          stockQuantity: product.stockQuantity,
          stockStatus: product.stockStatus,
          checkoutWarehouseCode: product.checkoutWarehouseCode
        });
        setIsLoading(false);
      } catch (error) {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : "Failed to load product details.");
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally depend on product.id — list row identity. Fresh fetch always wins for content fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- product list fields (stock) are merged from latest closure
  }, [product.id]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editorProduct || isLoading) return;
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const result = await raceWithTimeout(
          saveProductQuickEditClientAction(formData),
          undefined,
          "Save product changes"
        );
        if (result.ok) {
          notify.success(result.message || FEEDBACK_MESSAGES.productUpdated, {
            source: "admin",
            id: "product:quick-edit"
          });
          onClose();
          return;
        }
        notify.error(result.message || FEEDBACK_MESSAGES.failedToSaveChanges, {
          source: "admin",
          id: "product:quick-edit:error"
        });
      } catch (error) {
        notify.error(
          error instanceof Error ? error.message : FEEDBACK_MESSAGES.failedToSaveChanges,
          { source: "admin", id: "product:quick-edit:error" }
        );
      }
    });
  };

  return (
    <div data-product-detail-modal className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4 backdrop-blur-[2px]">
      <form
        id="update-product"
        onSubmit={handleSubmit}
        data-product-quick-edit
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[var(--platform-radius-lg)] bg-[var(--platform-surface)] shadow-none"
      >
        <input type="hidden" name="product_slug" value={product.id} />
        <input type="hidden" name="change_summary" value={`Edit product details ${product.id}`} />
        {editorProduct?.updatedAt ? (
          <input type="hidden" name="expected_updated_at" value={editorProduct.updatedAt} />
        ) : null}

        <div className="flex items-start justify-between gap-4 px-5 py-4">
          <div>
            <p className="type-meta font-semibold uppercase tracking-[0.12em] text-[var(--platform-text-muted)]">Product info</p>
            <h2 className="mt-1 text-lg font-medium text-[var(--platform-text-primary)]">Edit product</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--platform-text-secondary)] transition hover:bg-[var(--platform-accent-soft)] hover:text-[var(--platform-text-primary)] disabled:opacity-60"
          >
            Cancel
          </button>
        </div>

        {isLoading ? (
          <div className="grid gap-3 px-5 py-8" aria-busy="true">
            <p className="text-sm text-[var(--platform-text-secondary)]">Loading product details from catalog…</p>
            <div className="h-24 animate-pulse rounded-[10px] bg-[var(--platform-surface-muted)]" />
            <div className="h-40 animate-pulse rounded-[10px] bg-[var(--platform-surface-muted)]" />
          </div>
        ) : loadError || !editorProduct ? (
          <div className="grid gap-3 px-5 py-8">
            <p className="text-sm text-[var(--platform-danger)]">
              {loadError || "Product details could not be loaded."}
            </p>
            <p className="text-xs text-[var(--platform-text-muted)]">
              Saving is disabled until the editor can load description and specs from Supabase.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 overflow-y-auto px-5 py-5">
            <section data-product-basic-info className="grid gap-4">
              <p className="type-meta font-semibold uppercase tracking-[0.12em] text-[var(--platform-text-muted)]">Basic info</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm sm:col-span-2">
                  <ProductFieldLabel>Name</ProductFieldLabel>
                  <input
                    name="name"
                    defaultValue={editorProduct.title}
                    className="h-10 w-full rounded-[10px] border-0 bg-[var(--platform-surface)] px-3 text-sm text-[var(--platform-text-primary)] outline-none focus:bg-[var(--platform-accent-soft)] focus:ring-2 focus:ring-[var(--platform-focus-ring)]"
                  />
                </label>
                <label className="grid gap-1.5 text-sm sm:col-span-2">
                  <ProductFieldLabel>Tagline</ProductFieldLabel>
                  <input
                    name="tagline"
                    defaultValue={editorProduct.tagline ?? ""}
                    placeholder="Short subtitle shown under the product name"
                    className="h-10 w-full rounded-[10px] border-0 bg-[var(--platform-surface)] px-3 text-sm text-[var(--platform-text-primary)] outline-none focus:bg-[var(--platform-accent-soft)] focus:ring-2 focus:ring-[var(--platform-focus-ring)]"
                  />
                </label>
                <div className="text-sm sm:col-span-2">
                  <ProductCategoryField
                    key={editorProduct.id}
                    categories={categoryOptions}
                    deleteCategoryAction={deleteCategoryAction}
                    defaultCategory={editorProduct.category}
                  />
                </div>
              </div>

              <ProductBadgeFields
                text={editorProduct.badgeText ?? ""}
                style={editorProduct.badgeStyle ?? "default"}
              />

              <label className="grid gap-1.5 text-sm">
                <ProductFieldLabel>Description</ProductFieldLabel>
                <input type="hidden" name="description_editor_present" value="1" />
                <RichTextEditor
                  key={`${editorProduct.id}:${editorProduct.updatedAt ?? "loaded"}`}
                  name="description"
                  jsonName="description_json"
                  defaultValue={editorProduct.description ?? ""}
                  defaultJson={editorProduct.descriptionJson ?? undefined}
                  placeholder="Describe features, payload, and warranty details..."
                  documentType="product_description"
                  documentId={editorProduct.id}
                />
              </label>

              <ProductMultiImageField
                variant="admin"
                defaults={{
                  imageSrc: editorProduct.thumbnailSrc ?? "",
                  galleryUrls: editorProduct.galleryUrls ?? [],
                  galleryItems: editorProduct.galleryItems ?? []
                }}
              />

              <ProductSpecFields specs={editorProduct.specs ?? {}} />
            </section>

            <ProductPricingFields
              initialPrice={Number(editorProduct.price) || 0}
              initialCompareAt={editorProduct.compareAt ? Number(editorProduct.compareAt) : null}
              initialOnSale={editorProduct.onSale}
              initialDiscountType={editorProduct.discountType}
              initialDiscountValue={editorProduct.discountValue ? Number(editorProduct.discountValue) : null}
              initialCostOfGoods={editorProduct.costOfGoods ? Number(editorProduct.costOfGoods) : null}
              initialShowPricePerUnit={editorProduct.showPricePerUnit}
            />

            <ProductTaxFields
              initialChargeTax={editorProduct.chargeTax ?? true}
              initialTaxGroup={editorProduct.taxGroup ?? "products-default"}
              initialTaxRate={editorProduct.taxRate ? Number(editorProduct.taxRate) : null}
              initialTaxIncluded={editorProduct.taxIncluded}
            />

            <section className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5 text-sm">
                <ProductFieldLabel>Stock</ProductFieldLabel>
                <p className="flex h-10 items-center rounded-[10px] bg-[var(--platform-surface-muted)] px-3 text-sm text-[var(--platform-text-secondary)]">
                  {editorProduct.sourceAvailability || "Derived from admin inventory"}
                </p>
                <p className="text-xs text-[var(--platform-text-muted)]">
                  Update quantities on{" "}
                  <a href={`/admin/inventory?product=${encodeURIComponent(editorProduct.id)}`} className="text-[var(--platform-accent)] hover:underline">
                    Inventory
                  </a>
                  .
                </p>
              </div>
              <label className="grid gap-1.5 text-sm">
                <ProductFieldLabel>Visibility</ProductFieldLabel>
                <select
                  name="visibility"
                  defaultValue={editorProduct.isVisible ? "visible" : "hidden"}
                  className="h-10 w-full rounded-[10px] border-0 bg-[var(--platform-surface)] px-3 text-sm text-[var(--platform-text-primary)] outline-none focus:bg-[var(--platform-accent-soft)] focus:ring-2 focus:ring-[var(--platform-focus-ring)]"
                >
                  <option value="visible">Visible</option>
                  <option value="hidden">Hidden</option>
                </select>
              </label>
            </section>
          </div>
        )}

        <div className="flex justify-end px-5 py-4">
          <button
            type="submit"
            disabled={isSaving || isLoading || !editorProduct || Boolean(loadError)}
            aria-busy={isSaving}
            className="platform-btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
