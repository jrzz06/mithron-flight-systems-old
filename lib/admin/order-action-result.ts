export type AdminOrderActionSuccess = { ok: true };

export type AdminOrderActionConflict = {
  ok: false;
  code: "conflict";
  message: string;
  currentRow?: Record<string, unknown>;
};

export type AdminOrderActionError = {
  ok: false;
  code: "error";
  message: string;
};

export type AdminOrderActionResult = AdminOrderActionSuccess | AdminOrderActionConflict | AdminOrderActionError;

export type AdminOrderFormAction = (formData: FormData) => Promise<AdminOrderActionResult | void>;

function isRecordConflictError(
  error: unknown
): error is Error & { currentRow?: Record<string, unknown> } {
  return error instanceof Error && error.name === "AdminRecordConflictError";
}

export function adminOrderActionSuccess(): AdminOrderActionSuccess {
  return { ok: true };
}

export function adminOrderActionFromError(error: unknown): AdminOrderActionResult {
  if (isRecordConflictError(error)) {
    return adminOrderActionConflict(error);
  }
  return {
    ok: false,
    code: "error",
    message: error instanceof Error ? error.message : String(error)
  };
}

export function adminOrderActionConflict(
  error: Error & { currentRow?: Record<string, unknown> }
): AdminOrderActionConflict {
  return {
    ok: false,
    code: "conflict",
    message: error.message.trim() || "Concurrent order update detected.",
    currentRow: error.currentRow
  };
}

export function isAdminOrderActionConflict(result: unknown): result is AdminOrderActionConflict {
  return (
    typeof result === "object"
    && result !== null
    && "ok" in result
    && (result as AdminOrderActionResult).ok === false
    && (result as AdminOrderActionConflict).code === "conflict"
  );
}

export function cloneFormDataWithExpectedUpdatedAt(formData: FormData, expectedUpdatedAt: string) {
  const next = new FormData();
  for (const [key, value] of formData.entries()) {
    if (key === "expected_updated_at") continue;
    next.append(key, value);
  }
  next.set("expected_updated_at", expectedUpdatedAt);
  return next;
}

export const ORDER_CONFLICT_AUTO_SYNC_HINT =
  "The order was synced to the latest state automatically.";

export const ORDER_CONFLICT_RETRY_FAILED_HINT =
  "The order changed again before your action could finish. Please try once more.";
