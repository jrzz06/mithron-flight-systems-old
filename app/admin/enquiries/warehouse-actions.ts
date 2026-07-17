"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assignOrderToWarehouseFormAction } from "@/app/admin/orders/actions";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function assignLinkedOrderToWarehouseFormAction(formData: FormData) {
  const orderId = readString(formData, "order_id");
  const returnPath = readString(formData, "return_path") || "/admin/enquiries";
  const result = await assignOrderToWarehouseFormAction(formData);

  if (result && "ok" in result && result.ok === true) {
    revalidatePath(returnPath);
    revalidatePath("/admin/orders");
    redirect(
      `/admin/orders?order=${encodeURIComponent(orderId)}&queue=warehouse&order_status=success&order_message=${encodeURIComponent("Order assigned to warehouse.")}`
    );
  }
}
