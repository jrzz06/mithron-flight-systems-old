"use server";

import { revalidatePath } from "next/cache";
import { revalidateAfterMutation } from "@/lib/control-plane/revalidate-realtime";
import { actionErrorMessage, isNextRedirect } from "@/lib/server-action-feedback";
import { requireAdminPermission } from "@/services/auth";
import { deleteLead, pushLeadToOrder } from "@/services/leads";

async function revalidateLeadSurfaces() {
  revalidatePath("/admin/leads");
  revalidatePath("/admin/orders");
  await revalidateAfterMutation("leads", "orders", "order_items");
}

export type LeadActionResult = {
  ok: boolean;
  message: string;
  orderId?: string | null;
  orderNumber?: string | null;
};

export async function pushLeadToOrderFormAction(formData: FormData): Promise<LeadActionResult> {
  try {
    const context = await requireAdminPermission("enquiries.write");
    const leadId = String(formData.get("lead_id") ?? "").trim();
    if (!leadId) throw new Error("Lead id is required.");

    const result = await pushLeadToOrder(
      leadId,
      context.userId!,
      {
        address: String(formData.get("address") ?? "").trim() || null,
        productSlug: String(formData.get("product_slug") ?? "").trim() || null,
        productName: String(formData.get("product_name") ?? "").trim() || null
      }
    );

    await revalidateLeadSurfaces();

    return {
      ok: true,
      message: `Order ${String(result.order_number ?? "")} created.`,
      orderId: String(result.order_id ?? "") || null,
      orderNumber: String(result.order_number ?? "") || null
    };
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    return { ok: false, message: actionErrorMessage(error) };
  }
}

export async function deleteLeadFormAction(formData: FormData): Promise<LeadActionResult> {
  try {
    const context = await requireAdminPermission("enquiries.write");
    const leadId = String(formData.get("lead_id") ?? "").trim();
    if (!leadId) throw new Error("Lead id is required.");

    const result = await deleteLead(leadId, context.userId!);
    await revalidateLeadSurfaces();

    return {
      ok: true,
      message: `${result.reference} deleted.`
    };
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    return { ok: false, message: actionErrorMessage(error) };
  }
}
