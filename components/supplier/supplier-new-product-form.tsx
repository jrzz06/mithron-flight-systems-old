"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { OperationalSubmitButton } from "@/components/admin/operational-submit-button";
import { PlatformActionBar, PlatformActionGroup } from "@/components/platform/action-bar";
import { RichTextEditorField } from "@/components/editor/RichTextEditor/rich-text-editor-field";
import { SupplierFormDebugPanel } from "@/components/supplier/supplier-form-debug-panel";
import { SupplierFormStatusOverlay } from "@/components/supplier/supplier-form-status-overlay";
import { SupplierInlineResultDialog } from "@/components/supplier/supplier-inline-result-dialog";
import { ProductCategoryField } from "@/components/products/product-category-field";
import { SupplierProductImageField } from "@/components/supplier/supplier-product-image-field";
import { useSyncGlobalBusy } from "@/components/ui/global-busy";
import { isSupplierProductFormDebugEnabled } from "@/lib/supplier/product-form-debug";
import type { ProductCategoryOption } from "@/lib/product-category-options";
import { wrapServerAction } from "@/hooks/use-async-action";

export type SupplierProductFormState = {
  status: "idle" | "success" | "error";
  message: string;
  debug?: Array<{ label: string; value: string }>;
};

const initialState: SupplierProductFormState = { status: "idle", message: "" };

function fieldLabelFromInvalidTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
    return "Form field";
  }
  const labelledBy = target.labels?.[0]?.textContent?.trim();
  return labelledBy || target.name || target.type || "Form field";
}

export function SupplierNewProductForm({
  action,
  categoryOptions = []
}: {
  action: (prevState: SupplierProductFormState, formData: FormData) => Promise<SupplierProductFormState>;
  categoryOptions?: ProductCategoryOption[];
}) {
  const searchParams = useSearchParams();
  const debugEnabled = isSupplierProductFormDebugEnabled(searchParams);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const timedAction = useMemo(() => wrapServerAction(action, { label: "Save product" }), [action]);
  const [state, formAction, pending] = useActionState(timedAction, initialState);
  const [pendingLabel, setPendingLabel] = useState("Saving draft");
  const [dismissedErrorMessage, setDismissedErrorMessage] = useState("");
  const [clientValidationError, setClientValidationError] = useState("");
  const [lastSubmittedFields, setLastSubmittedFields] = useState<Record<string, string>>({});
  const errorDialogOpen = state.status === "error" && Boolean(state.message) && dismissedErrorMessage !== state.message;
  useSyncGlobalBusy("supplier-new-product", pending);

  function handleInvalid(event: React.FormEvent<HTMLFormElement>) {
    const target = event.target;
    const label = fieldLabelFromInvalidTarget(target);
    const message =
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
        ? target.validationMessage
        : "Please complete all required fields.";
    const nextError = `${label}: ${message}`;
    setClientValidationError(nextError);
    if (debugEnabled) {
      console.info("[supplier-product-form] client validation blocked submit", { label, message });
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    setClientValidationError("");
    const formData = new FormData(event.currentTarget);
    const entries = Object.fromEntries(formData.entries());
    setLastSubmittedFields(Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, String(value)])));
    if (debugEnabled) {
      console.info("[supplier-product-form] client submit", entries);
    }
  }

  const debugEntries = [
    ...(debugEnabled
      ? [
          { label: "Debug mode", value: "enabled (?product_debug=1 or SUPPLIER_PRODUCT_FORM_DEBUG=1)" },
          { label: "Last client FormData", value: JSON.stringify(lastSubmittedFields, null, 2) || "(none yet)" },
          { label: "Action pending", value: String(pending) },
          { label: "Action state", value: JSON.stringify({ status: state.status, message: state.message }, null, 2) }
        ]
      : []),
    ...(state.debug ?? [])
  ];

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
        open={errorDialogOpen}
        status="error"
        title="Product not saved"
        message={state.message || clientValidationError || "Could not save product draft. Check the form and try again."}
        onPrimary={() => setDismissedErrorMessage(state.message)}
      />
    </>
  );
}
