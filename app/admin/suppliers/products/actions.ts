"use server";

import { revalidatePath } from "next/cache";
import { operationalFeedbackFromActionError, readExpectedUpdatedAt } from "@/lib/admin/conflict-handling";
import { revalidateAfterMutation } from "@/lib/control-plane/revalidate-realtime";
import { FEEDBACK_MESSAGES } from "@/lib/feedback/messages";
import { requirePermission } from "@/services/auth";
import { revalidateCatalogSurfaces } from "@/lib/catalog-cache";
import {
  createNotificationRecord,
  fetchAdminRecordsByColumn,
  updateAdminRecord
} from "@/services/admin-actions";
import {
  parseApprovalInventoryFromFormData,
  saveProductInventory
} from "@/services/product-inventory-workflow";
import { assertProductCanPublish } from "@/services/product-publish";

export type SupplierProductActionResult = {
  ok: boolean;
  status: "success" | "error" | "conflict";
  message: string;
  slug?: string;
};

async function revalidateSupplierProductSurfaces(slug?: string, includeCatalog = false) {
  if (includeCatalog && slug) {
    await revalidateCatalogSurfaces(slug);
  }
  revalidatePath("/admin/suppliers/products");
  revalidatePath("/admin/products");
  revalidatePath("/admin/inventory");
  revalidatePath("/warehouse/inventory");
  revalidatePath("/supplier/submissions");
  revalidatePath("/supplier/products");
  await revalidateAfterMutation("mithron_products", "notifications");
}

async function runSupplierApprovalAction(
  successMessage: string,
  slug: string,
  action: () => Promise<void>
): Promise<SupplierProductActionResult> {
  try {
    await action();
    return { ok: true, status: "success", message: successMessage, slug };
  } catch (error) {
    const feedback = operationalFeedbackFromActionError(error);
    return {
      ok: false,
      status: feedback.status === "warning" ? "conflict" : "error",
      message: feedback.message,
      slug
    };
  }
}

export async function approveProductSubmissionFormAction(formData: FormData): Promise<SupplierProductActionResult> {
  const slug = String(formData.get("slug") ?? "").trim();
  return runSupplierApprovalAction(FEEDBACK_MESSAGES.productApproved, slug, async () => {
    const context = await requirePermission("products.write");
    if (!context.userId) throw new Error("Authentication required.");
    const actorId = context.userId;
    if (!slug) throw new Error("Product slug is required.");
    const rows = await fetchAdminRecordsByColumn("mithron_products", "slug", slug);
    const product = rows[0];
    if (!product) throw new Error("Product not found.");
    if (String(product.workflow_status) !== "pending_review") {
      throw new Error("Only pending_review products can be approved.");
    }
    if (!String(product.supplier_id ?? "").trim()) {
      throw new Error(
        `Product "${slug}" is missing a supplier owner. Reject it or assign supplier_id before approval.`
      );
    }

    await assertProductCanPublish(slug, { requireSupplier: true });
    const expectedUpdatedAt = readExpectedUpdatedAt(formData, String(product.updated_at ?? ""));
    const inventoryInput = parseApprovalInventoryFromFormData(formData, slug);

    if (inventoryInput && inventoryInput.quantity > 0 && inventoryInput.warehouseCode) {
      await saveProductInventory(inventoryInput, actorId, {
        auditAction: "supplier.approval_inventory"
      });
    }

    await updateAdminRecord(
      "mithron_products",
      "slug",
      slug,
      {
        workflow_status: "published",
        is_visible: true,
        approved_at: new Date().toISOString(),
        approved_by: actorId,
        rejection_reason: null,
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      actorId,
      process.env,
      { expectedUpdatedAt }
    );

    const supplierId = String(product.supplier_id ?? "");
    if (supplierId) {
      await createNotificationRecord(
        {
          recipient_id: supplierId,
          channel: "supplier",
          title: "Product approved",
          body: `${String(product.name)} is now published on the storefront${inventoryInput && inventoryInput.quantity > 0 ? " with initial inventory applied" : " and seeded into inventory"}.`,
          status: "unread",
          entity_table: "mithron_products",
          entity_id: slug
        },
        actorId
      );
    }

    await revalidateSupplierProductSurfaces(slug, true);
  });
}

export async function rejectProductSubmissionFormAction(formData: FormData): Promise<SupplierProductActionResult> {
  const slug = String(formData.get("slug") ?? "").trim();
  return runSupplierApprovalAction(FEEDBACK_MESSAGES.productRejected, slug, async () => {
    const context = await requirePermission("products.write");
    const reason = String(formData.get("rejection_reason") ?? "").trim();
    if (!slug || !reason) throw new Error("Product slug and rejection reason are required.");
    const rows = await fetchAdminRecordsByColumn("mithron_products", "slug", slug);
    const product = rows[0];
    if (!product) throw new Error("Product not found.");
    if (String(product.workflow_status) !== "pending_review") {
      throw new Error("Only pending_review products can be rejected.");
    }

    const expectedUpdatedAt = readExpectedUpdatedAt(formData, String(product.updated_at ?? ""));
    await updateAdminRecord(
      "mithron_products",
      "slug",
      slug,
      {
        workflow_status: "rejected",
        is_visible: false,
        rejection_reason: reason,
        updated_at: new Date().toISOString()
      },
      context.userId,
      process.env,
      { expectedUpdatedAt }
    );

    const supplierId = String(product.supplier_id ?? "");
    if (supplierId) {
      await createNotificationRecord(
        {
          recipient_id: supplierId,
          channel: "supplier",
          title: "Product rejected",
          body: `${String(product.name)} was rejected: ${reason}`,
          status: "unread",
          entity_table: "mithron_products",
          entity_id: slug
        },
        context.userId
      );
    }

    await revalidateSupplierProductSurfaces();
  });
}
