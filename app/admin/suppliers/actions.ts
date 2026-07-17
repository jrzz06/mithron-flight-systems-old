"use server";

import { revalidatePath } from "next/cache";
import { assertSupabaseAdminConfig } from "@/lib/env";
import { revalidateAfterMutation } from "@/lib/control-plane/revalidate-realtime";
import { insertUserNotification } from "@/lib/notifications/create-notification";
import { createClient as createSupabaseServiceClient } from "@supabase/supabase-js";
import {
  disableManagedUserAction,
  reactivateManagedUserAction
} from "@/app/admin/settings/actions";
import { requireAdminPermission } from "@/services/auth";

export type SupplierActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const idleState: SupplierActionState = { status: "idle", message: "" };

function actionError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 240);
}

function serviceClient() {
  const config = assertSupabaseAdminConfig(process.env);
  return createSupabaseServiceClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

async function revalidateSupplierSurfaces() {
  revalidatePath("/admin/suppliers");
  await revalidateAfterMutation("profiles");
}

export async function approveSupplierFormAction(
  _prevState: SupplierActionState,
  formData: FormData
): Promise<SupplierActionState> {
  const context = await requireAdminPermission("settings.write");
  const supplierId = String(formData.get("supplier_id") ?? "").trim();
  const verificationStatus = String(formData.get("verification_status") ?? "").trim();

  try {
    if (!supplierId) throw new Error("Supplier id is required.");

    if (verificationStatus === "disabled") {
      const payload = new FormData();
      payload.set("user_id", supplierId);
      await reactivateManagedUserAction(payload);
    } else if (verificationStatus === "pending") {
      const supabase = serviceClient();
      const updated = await supabase.auth.admin.updateUserById(supplierId, { email_confirm: true });
      if (updated.error) {
        throw new Error(updated.error.message || "Failed to approve supplier account.");
      }
    }

    await insertUserNotification({
      recipientId: supplierId,
      channel: "supplier",
      title: "Supplier account approved",
      body: "Your supplier account has been approved. You can now manage products and inventory.",
      entityTable: "profiles",
      entityId: supplierId,
      actorId: context.userId!,
      payload: {
        event: "suppliers.approve",
        verification_status: verificationStatus || "approved"
      },
      dedupeKey: `suppliers-approve:${supplierId}`
    });

    await revalidateSupplierSurfaces();
    await revalidateAfterMutation("notifications");
    return { status: "success", message: "Supplier approved." };
  } catch (error) {
    return { status: "error", message: actionError(error) };
  }
}

export async function suspendSupplierFormAction(
  _prevState: SupplierActionState,
  formData: FormData
): Promise<SupplierActionState> {
  const context = await requireAdminPermission("settings.write");
  const supplierId = String(formData.get("supplier_id") ?? "").trim();

  try {
    if (!supplierId) throw new Error("Supplier id is required.");

    const payload = new FormData();
    payload.set("user_id", supplierId);
    await disableManagedUserAction(payload);

    await insertUserNotification({
      recipientId: supplierId,
      channel: "supplier",
      title: "Supplier account suspended",
      body: "Your supplier account has been suspended by an administrator.",
      entityTable: "profiles",
      entityId: supplierId,
      actorId: context.userId!,
      priority: "high",
      payload: {
        event: "suppliers.suspend"
      },
      dedupeKey: `suppliers-suspend:${supplierId}`
    });

    await revalidateSupplierSurfaces();
    await revalidateAfterMutation("notifications");
    return { status: "success", message: "Supplier suspended." };
  } catch (error) {
    return { status: "error", message: actionError(error) };
  }
}

export { idleState as supplierActionIdleState };
