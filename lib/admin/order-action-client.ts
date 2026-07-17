import {
  cloneFormDataWithExpectedUpdatedAt,
  isAdminOrderActionConflict,
  ORDER_CONFLICT_AUTO_SYNC_HINT,
  ORDER_CONFLICT_RETRY_FAILED_HINT,
  type AdminOrderActionResult,
  type AdminOrderFormAction
} from "@/lib/admin/order-action-result";
import { raceWithTimeout } from "@/lib/fetch-with-timeout";

export type OrderActionClientOutcome =
  | { kind: "success" }
  | { kind: "failed" }
  | { kind: "feedback"; status: "warning"; message: string };

export async function runOrderFormActionWithConflictRetry(
  action: AdminOrderFormAction,
  formData: FormData,
  options: {
    orderId: string;
    patchOrder: (orderId: string, row: Record<string, unknown>) => void;
    onActionFeedback?: (feedback: { status: "warning" | "error" | "success"; message: string }) => void;
  }
): Promise<OrderActionClientOutcome> {
  const attempt = async (payload: FormData) =>
    raceWithTimeout(action(payload), undefined, "Update order");

  let result: AdminOrderActionResult | void = await attempt(formData);
  if (isAdminOrderActionConflict(result)) {
    const currentRow = result.currentRow;
    const freshUpdatedAt =
      currentRow && typeof currentRow.updated_at === "string" ? currentRow.updated_at.trim() : "";

    if (currentRow) {
      options.patchOrder(options.orderId, currentRow);
    }

    if (freshUpdatedAt) {
      options.onActionFeedback?.({
        status: "warning",
        message: ORDER_CONFLICT_AUTO_SYNC_HINT
      });
      result = await attempt(cloneFormDataWithExpectedUpdatedAt(formData, freshUpdatedAt));
    }
  }

  if (isAdminOrderActionConflict(result)) {
    if (result.currentRow) {
      options.patchOrder(options.orderId, result.currentRow);
    }
    options.onActionFeedback?.({
      status: "warning",
      message: ORDER_CONFLICT_RETRY_FAILED_HINT
    });
    return { kind: "failed" };
  }

  if (result && !result.ok && result.code === "error") {
    throw new Error(result.message);
  }

  return { kind: "success" };
}
