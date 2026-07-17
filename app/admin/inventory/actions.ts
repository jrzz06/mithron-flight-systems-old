"use server";

import { operationalFeedbackFromActionError } from "@/lib/admin/conflict-handling";
import { isActionNavigationError } from "@/lib/server-action-errors";
import { raceWithTimeout } from "@/lib/fetch-with-timeout";
import {
  importInventoryCsvFormAction,
  saveInventoryBulkRestockFormAction,
  saveInventoryBulkUpdateFormAction,
  saveInventoryQuickEditFormAction
} from "@/app/warehouse/actions";

export type InventoryActionResult = {
  ok: boolean;
  status: "success" | "error" | "conflict";
  message: string;
};

/** Fail-fast so bulk restock cannot leave "Restocking all..." pending forever. */
const INVENTORY_MUTATION_TIMEOUT_MS = 55_000;

function inventoryResultFromError(error: unknown): InventoryActionResult {
  const feedback = operationalFeedbackFromActionError(error);
  return {
    ok: false,
    status: feedback.status === "warning" ? "conflict" : "error",
    message: feedback.message.slice(0, 240)
  };
}

export async function saveAdminInventoryAction(formData: FormData): Promise<InventoryActionResult> {
  try {
    await saveInventoryQuickEditFormAction(formData);
    return { ok: true, status: "success", message: "Inventory updated." };
  } catch (error) {
    if (isActionNavigationError(error)) throw error;
    return inventoryResultFromError(error);
  }
}

export async function saveInventoryAdjustmentAction(formData: FormData): Promise<InventoryActionResult> {
  try {
    await saveInventoryQuickEditFormAction(formData);
    return { ok: true, status: "success", message: "Stock adjusted." };
  } catch (error) {
    if (isActionNavigationError(error)) throw error;
    return inventoryResultFromError(error);
  }
}

export async function importAdminInventoryAction(formData: FormData): Promise<InventoryActionResult> {
  try {
    await raceWithTimeout(importInventoryCsvFormAction(formData), INVENTORY_MUTATION_TIMEOUT_MS, "Inventory import");
    return { ok: true, status: "success", message: "Inventory imported." };
  } catch (error) {
    if (isActionNavigationError(error)) throw error;
    return {
      ok: false,
      status: "error",
      message: (error instanceof Error ? error.message : String(error)).slice(0, 240)
    };
  }
}

export async function bulkAdminInventoryAction(formData: FormData): Promise<InventoryActionResult> {
  try {
    await raceWithTimeout(
      saveInventoryBulkUpdateFormAction(formData),
      INVENTORY_MUTATION_TIMEOUT_MS,
      "Bulk inventory update"
    );
    return { ok: true, status: "success", message: "Bulk inventory updated." };
  } catch (error) {
    if (isActionNavigationError(error)) throw error;
    return {
      ok: false,
      status: "error",
      message: (error instanceof Error ? error.message : String(error)).slice(0, 240)
    };
  }
}

export async function restockAllAdminInventoryAction(formData: FormData): Promise<InventoryActionResult> {
  try {
    const amount = Number(String(formData.get("restock_amount") ?? "10").trim() || "10");
    await raceWithTimeout(
      saveInventoryBulkRestockFormAction(formData),
      INVENTORY_MUTATION_TIMEOUT_MS,
      "Quick restock"
    );
    const scope = String(formData.get("restock_scope") ?? "all").trim() || "all";
    return {
      ok: true,
      status: "success",
      message:
        scope === "selected"
          ? `Selected products restocked by +${amount}.`
          : `All products restocked by +${amount}.`
    };
  } catch (error) {
    if (isActionNavigationError(error)) throw error;
    return {
      ok: false,
      status: "error",
      message: (error instanceof Error ? error.message : String(error)).slice(0, 240)
    };
  }
}
