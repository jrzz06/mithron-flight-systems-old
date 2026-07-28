"use client";

import { OperationalSubmitButton } from "@/components/admin/operational-submit-button";
import { PlatformActionBar, PlatformActionGroup } from "@/components/platform/action-bar";
import { RichTextEditorField } from "@/components/editor/RichTextEditor/rich-text-editor-field";
import { SupplierFormStatusOverlay } from "@/components/supplier/supplier-form-status-overlay";
import { SupplierInlineResultDialog } from "@/components/supplier/supplier-inline-result-dialog";
import { ProductCategoryField } from "@/components/products/product-category-field";
import { SupplierProductImageField } from "@/components/supplier/supplier-product-image-field";
import { SupplierProductSpecFields } from "@/components/supplier/supplier-product-spec-fields";
import { useSupplierProductForm } from "@/hooks/use-supplier-product-form";
import type { ProductCategoryOption } from "@/lib/product-category-options";
import type { SupplierProductEditDefaults, SupplierProductFormState } from "@/lib/supplier/types";

export type { SupplierProductEditDefaults };

export function SupplierEditProductForm({
  action,
  defaults,
  categoryOptions = []
}: {
  action: (prevState: SupplierProductFormState, formData: FormData) => Promise<SupplierProductFormState>;
  defaults: SupplierProductEditDefaults;
  categoryOptions?: ProductCategoryOption[];
}) {
  const {
    state,
    formAction,
    pending,
    pendingLabel,
    setPendingLabel,
    feedbackRef,
    clientValidationError,
    resultDialogOpen,
    dismissDialog
  } = useSupplierProductForm({
    action,
    actionLabel: "Save product changes",
    syncKey: "supplier-edit-product"
  });

  return (
    <>
      <form
        action={formAction}
        data-supplier-product-edit-form
        className="relative grid gap-3 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] p-5"
      >
        <SupplierFormStatusOverlay pending={pending} label={pendingLabel} />
        <input type="hidden" name="slug" value={defaults.slug} />
        {defaults.updatedAt ? <input type="hidden" name="expected_updated_at" value={defaults.updatedAt} /> : null}
        <label className="grid gap-1 text-sm">
          <span className="text-[var(--platform-text-secondary)]">Product name</span>
          <input
            name="name"
            required
            defaultValue={defaults.name}
            autoComplete="off"
            className="rounded-lg border border-[var(--platform-border)] bg-[var(--platform-surface)] px-3 py-2 text-[var(--platform-text-primary)]"
          />
        </label>
        <ProductCategoryField variant="supplier" categories={categoryOptions} defaultCategory={defaults.category} />
        <label className="grid gap-1 text-sm">
          <span className="text-[var(--platform-text-secondary)]">Price (₹)</span>
          <input
            name="price"
            type="number"
            min="0.01"
            step="0.01"
            required
            defaultValue={defaults.price}
            className="rounded-lg border border-[var(--platform-border)] bg-[var(--platform-surface)] px-3 py-2 text-[var(--platform-text-primary)]"
          />
        </label>
        <RichTextEditorField
          label="Product description"
          name="description"
          jsonName="description_json"
          defaultValue={defaults.description ?? undefined}
          defaultJson={defaults.descriptionJson ?? undefined}
          documentType="supplier_product_description"
          documentId={defaults.slug}
          placeholder="Describe capabilities, payload, warranty, and documentation..."
        />

        <SupplierProductSpecFields specs={defaults.specs} />

        <SupplierProductImageField
          defaults={{
            imageSrc: defaults.imageSrc,
            imageAlt: defaults.imageAlt || defaults.name,
            galleryUrls: defaults.galleryUrls
          }}
        />

        {clientValidationError ? (
          <p
            role="alert"
            data-supplier-product-edit-feedback="validation"
            className="platform-feedback-error rounded-[var(--platform-radius)] px-3 py-2.5 text-sm"
          >
            {clientValidationError}
          </p>
        ) : null}

        {state.status === "error" ? (
          <p
            ref={feedbackRef}
            role="alert"
            data-supplier-product-edit-feedback="error"
            className="platform-feedback-error rounded-[var(--platform-radius)] px-3 py-2.5 text-sm"
          >
            {state.message}
          </p>
        ) : null}
        {state.status === "success" ? (
          <p
            role="status"
            data-supplier-product-edit-feedback="success"
            className="platform-feedback-success rounded-[var(--platform-radius)] px-3 py-2.5 text-sm"
          >
            {state.message}
          </p>
        ) : null}

        <PlatformActionBar>
          <PlatformActionGroup>
            <OperationalSubmitButton
              pendingLabel="Saving changes"
              name="submit_for_approval"
              value="0"
              onClick={() => setPendingLabel("Saving changes")}
              className="platform-btn-secondary platform-btn-md"
            >
              Save changes
            </OperationalSubmitButton>
            <OperationalSubmitButton
              pendingLabel="Sending for review"
              confirmMessage="Save these changes and send this product to our team for review?"
              name="submit_for_approval"
              value="1"
              onClick={() => setPendingLabel("Saving and sending for review")}
            >
              Save and send for review
            </OperationalSubmitButton>
          </PlatformActionGroup>
        </PlatformActionBar>
      </form>

      <SupplierInlineResultDialog
        open={resultDialogOpen}
        status={state.status === "success" ? "success" : "error"}
        title={state.status === "success" ? "Product updated" : "Could not save product"}
        message={state.message}
        onPrimary={dismissDialog}
      />
    </>
  );
}
