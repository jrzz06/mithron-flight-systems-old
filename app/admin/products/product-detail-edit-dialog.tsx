"use client";

import { useTransition } from "react";
import { ProductBadgeFields } from "@/components/admin/product-badge-fields";
import { ProductFieldLabel } from "@/components/admin/product-info-tooltip";
import { ProductPricingFields } from "@/components/admin/product-pricing-fields";
import { ProductSpecFields } from "@/components/admin/product-spec-fields";
import { ProductTaxFields } from "@/components/admin/product-tax-fields";
import { ProductMultiImageField } from "@/components/products/product-multi-image-field";
import { RichTextEditor } from "@/components/editor/RichTextEditor/lazy";
import type { ProductCatalogGridRow } from "@/app/admin/products/product-catalog-grid";
import { saveProductQuickEditClientAction } from "@/app/admin/products/actions";
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

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
        {product.updatedAt ? <input type="hidden" name="expected_updated_at" value={product.updatedAt} /> : null}

        <div className="flex items-start justify-between gap-4 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--platform-text-muted)]">Product info</p>
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

        <div className="grid gap-5 overflow-y-auto px-5 py-5">
          <section data-product-basic-info className="grid gap-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--platform-text-muted)]">Basic info</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm sm:col-span-2">
                <ProductFieldLabel>Name</ProductFieldLabel>
                <input
                  name="name"
                  defaultValue={product.title}
                  className="h-10 w-full rounded-[10px] border-0 bg-[var(--platform-surface)] px-3 text-sm text-[var(--platform-text-primary)] outline-none focus:bg-[var(--platform-accent-soft)] focus:ring-2 focus:ring-[var(--platform-focus-ring)]"
                />
              </label>
              <div className="text-sm sm:col-span-2">
                <ProductCategoryField
                  key={product.id}
                  categories={categoryOptions}
                  deleteCategoryAction={deleteCategoryAction}
                  defaultCategory={product.category}
                />
              </div>
            </div>

            <ProductBadgeFields
              text={product.badgeText ?? ""}
              style={product.badgeStyle ?? "default"}
            />

            <label className="grid gap-1.5 text-sm">
              <ProductFieldLabel>Description</ProductFieldLabel>
              <input type="hidden" name="description_editor_present" value="1" />
              <RichTextEditor
                key={product.id}
                name="description"
                jsonName="description_json"
                defaultValue={product.description ?? ""}
                defaultJson={product.descriptionJson ?? undefined}
                placeholder="Describe features, payload, and warranty details..."
                documentType="product_description"
                documentId={product.id}
              />
            </label>

            <ProductMultiImageField
              variant="admin"
              defaults={{
                imageSrc: product.thumbnailSrc ?? "",
                galleryUrls: product.galleryUrls ?? [],
                galleryItems: product.galleryItems ?? []
              }}
            />

            <ProductSpecFields specs={product.specs ?? {}} />
          </section>

          <ProductPricingFields
            initialPrice={Number(product.price) || 0}
            initialCompareAt={product.compareAt ? Number(product.compareAt) : null}
            initialOnSale={product.onSale}
            initialDiscountType={product.discountType}
            initialDiscountValue={product.discountValue ? Number(product.discountValue) : null}
            initialCostOfGoods={product.costOfGoods ? Number(product.costOfGoods) : null}
            initialShowPricePerUnit={product.showPricePerUnit}
          />

          <ProductTaxFields
            initialChargeTax={product.chargeTax ?? true}
            initialTaxGroup={product.taxGroup ?? "products-default"}
            initialTaxRate={product.taxRate ? Number(product.taxRate) : null}
            initialTaxIncluded={product.taxIncluded}
          />

          <section className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5 text-sm">
              <ProductFieldLabel>Stock</ProductFieldLabel>
              <p className="flex h-10 items-center rounded-[10px] bg-[var(--platform-surface-muted)] px-3 text-sm text-[var(--platform-text-secondary)]">
                {product.sourceAvailability || "Derived from admin inventory"}
              </p>
              <p className="text-xs text-[var(--platform-text-muted)]">
                Update quantities on{" "}
                <a href={`/admin/inventory?product=${encodeURIComponent(product.id)}`} className="text-[var(--platform-accent)] hover:underline">
                  Inventory
                </a>
                .
              </p>
            </div>
            <label className="grid gap-1.5 text-sm">
              <ProductFieldLabel>Visibility</ProductFieldLabel>
              <select
                name="visibility"
                defaultValue={product.isVisible ? "visible" : "hidden"}
                className="h-10 w-full rounded-[10px] border-0 bg-[var(--platform-surface)] px-3 text-sm text-[var(--platform-text-primary)] outline-none focus:bg-[var(--platform-accent-soft)] focus:ring-2 focus:ring-[var(--platform-focus-ring)]"
              >
                <option value="visible">Visible</option>
                <option value="hidden">Hidden</option>
              </select>
            </label>
          </section>
        </div>

        <div className="flex justify-end px-5 py-4">
          <button
            type="submit"
            disabled={isSaving}
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
