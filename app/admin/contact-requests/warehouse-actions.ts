"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isNextRedirect } from "@/lib/server-action-feedback";
import { assignOrderToWarehouseFormAction } from "@/app/admin/orders/actions";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function assignLinkedOrderToWarehouseFormAction(formData: FormData) {
  const orderId = readString(formData, "order_id");
  const returnPath = readString(formData, "return_path") || "/admin/contact-requests";
  const contactRequestId = readString(formData, "contact_request_id");

  try {
    const result = await assignOrderToWarehouseFormAction(formData);

    if (result && "ok" in result && result.ok === true) {
      revalidatePath(returnPath);
      revalidatePath("/admin/orders");
      redirect(
        `/admin/orders?order=${encodeURIComponent(orderId)}&queue=warehouse&order_status=success&order_message=${encodeURIComponent("Order assigned to warehouse.")}`
      );
    }

    const errorMessage = (result && "error" in result && typeof result.error === "string")
      ? result.error
      : "Could not assign order to warehouse. Check that the order is in a valid state and try again.";

    redirect(
      `/admin/contact-requests?open=${encodeURIComponent(contactRequestId || "")}&contact_request_id=${encodeURIComponent(contactRequestId || "")}&request_status=error&request_message=${encodeURIComponent(errorMessage)}`
    );
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(
      `/admin/contact-requests?open=${encodeURIComponent(contactRequestId || "")}&contact_request_id=${encodeURIComponent(contactRequestId || "")}&request_status=error&request_message=${encodeURIComponent("Could not assign order to warehouse.")}`
    );
  }
}
