"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isNextRedirect } from "@/lib/server-action-feedback";
import { requirePermission } from "@/services/auth";
import { createWarehouseRecord } from "@/services/warehouses";

function feedbackPath(status: "success" | "error", message: string) {
  return `/admin/warehouses?warehouse_status=${status}&warehouse_message=${encodeURIComponent(message.slice(0, 220))}`;
}

export async function createWarehouseFormAction(formData: FormData) {
  const context = await requirePermission("settings.write");
  const name = String(formData.get("warehouse_name") ?? "").trim();
  const location = String(formData.get("warehouse_location") ?? "").trim();

  try {
    const warehouse = await createWarehouseRecord({
      name,
      location: location || null,
      actorId: context.userId
    });
    revalidatePath("/admin/warehouses");
    revalidatePath("/admin/users");
    revalidatePath("/admin/orders");
    redirect(feedbackPath("success", `Created warehouse ${warehouse.name} (${warehouse.code}).`));
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackPath("error", error instanceof Error ? error.message : "Failed to create warehouse."));
  }
}
