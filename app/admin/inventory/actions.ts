"use server";

import { revalidatePath } from "next/cache";
import { operationalFeedbackFromActionError } from "@/lib/admin/conflict-handling";
import { isActionNavigationError } from "@/lib/server-action-errors";
import { raceWithTimeout } from "@/lib/fetch-with-timeout";
import { revalidateCatalogSurfaces } from "@/lib/catalog-cache";
import { revalidateAfterMutation } from "@/lib/control-plane/revalidate-realtime";
import {
  importInventoryCsvFormAction,
  saveInventoryBulkRestockFormAction,
  saveInventoryBulkUpdateFormAction,
  saveInventoryQuickEditFormAction
} from "@/app/warehouse/actions";
import {
  buildProductDeleteFromFormData,
  buildProductForceDeleteFromFormData
} from "@/services/product-admin-forms";
import {
  deleteOrArchiveProduct,
  getProductDeletionBlockers,
  type ProductDeletionBlockerResult
} from "@/services/admin-actions";
import { getCurrentAuthContext, requireAdminPermission, requirePermission } from "@/services/auth";

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

async function revalidateAfterInventoryProductDelete(slug: string) {
  await revalidateCatalogSurfaces(slug);
  await revalidateAfterMutation("mithron_products");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/products");
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/warehouse/inventory");
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

/** Preview operational blockers before permanent product delete from inventory. */
export async function previewInventoryProductDeleteAction(slug: string): Promise<ProductDeletionBlockerResult> {
  await requirePermission("products.write");
  const normalizedSlug = String(slug ?? "").trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug)) {
    throw new Error("Product slug must use lowercase letters, numbers, and hyphens only.");
  }
  return getProductDeletionBlockers(normalizedSlug);
}

/** Permanent hard delete for an archived inventory product (cascades inventory + warehouse_stock). */
export async function permanentDeleteAdminInventoryAction(formData: FormData): Promise<InventoryActionResult> {
  try {
    await requirePermission("products.write");
    const deleteInput = buildProductDeleteFromFormData(formData);
    const context = await getCurrentAuthContext();
    const result = await deleteOrArchiveProduct(deleteInput.identity.slug, context.userId, { mode: "hard" });
    if (result.outcome === "archived") {
      throw new Error("Product could not be permanently deleted.");
    }
    await revalidateAfterInventoryProductDelete(deleteInput.identity.slug);
    return { ok: true, status: "success", message: "Product permanently deleted." };
  } catch (error) {
    if (isActionNavigationError(error)) throw error;
    return inventoryResultFromError(error);
  }
}

/** Force hard delete when operational blockers exist (admin + products.permanent_delete). */
export async function forceDeleteAdminInventoryAction(formData: FormData): Promise<InventoryActionResult> {
  try {
    await requireAdminPermission("products.permanent_delete");
    const deleteInput = buildProductForceDeleteFromFormData(formData);
    const context = await getCurrentAuthContext();
    const result = await deleteOrArchiveProduct(deleteInput.identity.slug, context.userId, { mode: "force_hard" });
    if (result.outcome === "archived") {
      throw new Error("Product could not be force deleted.");
    }
    await revalidateAfterInventoryProductDelete(deleteInput.identity.slug);
    return { ok: true, status: "success", message: "Product force deleted." };
  } catch (error) {
    if (isActionNavigationError(error)) throw error;
    return inventoryResultFromError(error);
  }
}
