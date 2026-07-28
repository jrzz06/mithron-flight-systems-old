"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { wrapServerAction } from "@/hooks/use-async-action";
import { useSyncGlobalBusy } from "@/components/ui/global-busy";
import { notify } from "@/lib/feedback/notify";
import { isSupplierProductFormDebugEnabled } from "@/lib/supplier/product-form-debug";
import type { SupplierProductFormState } from "@/lib/supplier/types";

const initialState: SupplierProductFormState = { status: "idle", message: "" };

function extractFieldLabel(target: EventTarget | null): string {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
    return "Form field";
  }
  const labelText = target.labels?.[0]?.textContent?.trim();
  return labelText || target.name || target.type || "Form field";
}

export function useSupplierProductForm({
  action,
  actionLabel,
  syncKey
}: {
  action: (prevState: SupplierProductFormState, formData: FormData) => Promise<SupplierProductFormState>;
  actionLabel: string;
  syncKey: string;
}) {
  const searchParams = useSearchParams();
  const debugEnabled = isSupplierProductFormDebugEnabled(searchParams);
  const feedbackRef = useRef<HTMLParagraphElement>(null);

  const timedAction = useMemo(() => wrapServerAction(action, { label: actionLabel }), [action, actionLabel]);
  const [state, formAction, pending] = useActionState(timedAction, initialState);

  const [pendingLabel, setPendingLabel] = useState("Saving changes");
  const [dismissedDialogKey, setDismissedDialogKey] = useState("");
  const [clientValidationError, setClientValidationError] = useState("");
  const [lastSubmittedFields, setLastSubmittedFields] = useState<Record<string, string>>({});

  useSyncGlobalBusy(syncKey, pending);

  const resultDialogKey = state.status === "idle" || !state.message ? "" : `${state.status}:${state.message}`;
  const resultDialogOpen = Boolean(resultDialogKey) && dismissedDialogKey !== resultDialogKey;

  useEffect(() => {
    if (state.status === "success") {
      notify.success(state.message || "Changes saved", { source: "supplier" });
    } else if (state.status === "error") {
      notify.error(state.message || "Something went wrong", { source: "supplier" });
    }
  }, [state.message, state.status]);

  function handleInvalid(event: React.FormEvent<HTMLFormElement>) {
    const target = event.target;
    const label = extractFieldLabel(target);
    const message =
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
        ? target.validationMessage
        : "Please complete all required fields.";
    const errorText = `${label}: ${message}`;
    setClientValidationError(errorText);

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

  function dismissDialog() {
    setDismissedDialogKey(resultDialogKey);
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

  return {
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
  };
}
