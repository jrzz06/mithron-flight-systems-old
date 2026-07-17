"use client";

import type { JSONContent } from "@tiptap/core";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { OperationalSubmitButton } from "@/components/admin/operational-submit-button";
import { RichTextEditorField } from "@/components/editor/RichTextEditor/rich-text-editor-field";
import { SupplierFormStatusOverlay } from "@/components/supplier/supplier-form-status-overlay";
import { SupplierInlineResultDialog } from "@/components/supplier/supplier-inline-result-dialog";
import { ProductCategoryField } from "@/components/products/product-category-field";
import { SupplierProductImageField } from "@/components/supplier/supplier-product-image-field";
import { useSyncGlobalBusy } from "@/components/ui/global-busy";
import type { ProductCategoryOption } from "@/lib/product-category-options";
import type { SupplierProductFormState } from "@/components/supplier/supplier-new-product-form";
import { notify } from "@/lib/feedback/notify";
import { wrapServerAction } from "@/hooks/use-async-action";

const initialState: SupplierProductFormState = { status: "idle", message: "" };

export type SupplierProductEditDefaults = {
  slug: string;
  name: string;
  category: string;
  price: number;
  description?: string;
  descriptionJson?: string | JSONContent;
  imageSrc?: string;
  imageAlt?: string;
  galleryUrls?: string[];
  updatedAt?: string | null;
};

export function SupplierEditProductForm({
  action,
  defaults,
  categoryOptions = []
}: {
  action: (prevState: SupplierProductFormState, formData: FormData) => Promise<SupplierProductFormState>;
  defaults: SupplierProductEditDefaults;
  categoryOptions?: ProductCategoryOption[];
}) {
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const timedAction = useMemo(() => wrapServerAction(action, { label: "Save product changes" }), [action]);
  const [state, formAction, pending] = useActionState(timedAction, initialState);
  const [dismissedDialogKey, setDismissedDialogKey] = useState("");
  const resultDialogKey = state.status === "idle" || !state.message ? "" : `${state.status}:${state.message}`;
  const resultDialogOpen = Boolean(resultDialogKey) && dismissedDialogKey !== resultDialogKey;
  useSyncGlobalBusy("supplier-edit-product", pending);

  useEffect(() => {
    if (state.status === "success") {
      notify.success(state.message || "Changes saved", { source: "supplier" });
      return;
    }
    if (state.status === "error") {
      notify.error(state.message || "Something went wrong", { source: "supplier" });
    }
  }, [state.message, state.status]);

  return (
    <>
      <form
        action={formAction}
        data-supplier-product-edit-form
        className="relative grid gap-3 rounded-[8px] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] p-5"
      >
        <SupplierFormStatusOverlay pending={pending} label="Saving changes" />
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
          defaultValue={defaults.description}
          defaultJson={defaults.descriptionJson}
          documentType="supplier_product_description"
          documentId={defaults.slug}
          placeholder="Describe capabilities, payload, warranty, and documentation..."
        />

        <SupplierProductImageField
          defaults={{
            imageSrc: defaults.imageSrc,
            imageAlt: defaults.imageAlt || defaults.name,
            galleryUrls: defaults.galleryUrls
          }}
        />

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
        <OperationalSubmitButton pendingLabel="Saving changes">
          Save changes
        </OperationalSubmitButton>
      </form>

      <SupplierInlineResultDialog
        open={resultDialogOpen}
        status={state.status === "success" ? "success" : "error"}
        title={state.status === "success" ? "Product updated" : "Could not save product"}
        message={state.message}
        onPrimary={() => setDismissedDialogKey(resultDialogKey)}
      />
    </>
  );
}
