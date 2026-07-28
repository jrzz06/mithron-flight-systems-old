"use client";

import { OperationalSubmitButton } from "@/components/admin/operational-submit-button";
import { PlatformActionBar, PlatformActionGroup } from "@/components/platform/action-bar";
import { RichTextEditorField } from "@/components/editor/RichTextEditor/rich-text-editor-field";
import { SupplierFormDebugPanel } from "@/components/supplier/supplier-form-debug-panel";
import { SupplierFormStatusOverlay } from "@/components/supplier/supplier-form-status-overlay";
import { SupplierInlineResultDialog } from "@/components/supplier/supplier-inline-result-dialog";
import { ProductCategoryField } from "@/components/products/product-category-field";
import { SupplierProductImageField } from "@/components/supplier/supplier-product-image-field";
import { SupplierProductSpecFields } from "@/components/supplier/supplier-product-spec-fields";
import { useSupplierProductForm } from "@/hooks/use-supplier-product-form";
import type { ProductCategoryOption } from "@/lib/product-category-options";
import type { SupplierProductFormState } from "@/lib/supplier/types";

export function SupplierNewProductForm({
  action,
  categoryOptions = []
}: {
  action: (prevState: SupplierProductFormState, formData: FormData) => Promise<SupplierProductFormState>;
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
    dismissDialog,
    debugEnabled,
    debugEntries,
    handleInvalid,
    handleSubmit
  } = useSupplierProductForm({
    action,
    actionLabel: "Save product",
    syncKey: "supplier-new-product"
  });

  return (
    <>
      {debugEnabled ? <SupplierFormDebugPanel entries={debugEntries} /> : null}

      <form
        action={formAction}
        onInvalid={handleInvalid}
        onSubmit={handleSubmit}
        data-supplier-product-create-form
        className="relative grid gap-3 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] p-5"
      >
        <SupplierFormStatusOverlay pending={pending} label={pendingLabel} />

        <label className="grid gap-1 text-sm">
          <span className="text-[var(--platform-text-secondary)]">Product name</span>
          <input
            name="name"
            required
            autoComplete="off"
            placeholder="Agri spray drone kit"
            className="rounded-lg border border-[var(--platform-border)] bg-[var(--platform-surface)] px-3 py-2 text-[var(--platform-text-primary)]"
          />
        </label>
        <ProductCategoryField
          variant="supplier"
          categories={categoryOptions}
          defaultCategory={categoryOptions[0]?.label}
        />
        <label className="grid gap-1 text-sm">
          <span className="text-[var(--platform-text-secondary)]">Price (₹)</span>
          <input
            name="price"
            type="number"
            min="0.01"
            step="0.01"
            required
            placeholder="49999"
            className="rounded-lg border border-[var(--platform-border)] bg-[var(--platform-surface)] px-3 py-2 text-[var(--platform-text-primary)]"
          />
        </label>
        <RichTextEditorField
          label="Product description"
          name="description"
          jsonName="description_json"
          documentType="supplier_product_description"
          documentId="new"
          placeholder="Describe capabilities, payload, warranty, and documentation..."
        />

        <SupplierProductSpecFields />

        <SupplierProductImageField />

        {clientValidationError ? (
          <p
            role="alert"
            data-supplier-product-create-feedback="validation"
            className="platform-feedback-error rounded-[var(--platform-radius)] px-3 py-2.5 text-sm"
          >
            {clientValidationError}
          </p>
        ) : null}

        {state.status === "error" ? (
          <p
            ref={feedbackRef}
            role="alert"
            data-supplier-product-create-feedback="error"
            className="platform-feedback-error rounded-[var(--platform-radius)] px-3 py-2.5 text-sm"
          >
            {state.message}
          </p>
        ) : null}

        <PlatformActionBar>
          <PlatformActionGroup>
            <OperationalSubmitButton
              pendingLabel="Saving draft"
              name="submit_for_approval"
              value="0"
              onClick={() => setPendingLabel("Saving draft")}
              className="platform-btn-secondary platform-btn-md"
            >
              Save draft
            </OperationalSubmitButton>
            <OperationalSubmitButton
              pendingLabel="Sending for review"
              confirmMessage="Save this product and send it to our team for review?"
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
        status="error"
        title="Product not saved"
        message={state.message || clientValidationError || "Could not save product draft. Check the form and try again."}
        onPrimary={dismissDialog}
      />
    </>
  );
}
