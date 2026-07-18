"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { revalidateAfterMutation } from "@/lib/control-plane/revalidate-realtime";
import { isNextRedirect } from "@/lib/server-action-feedback";
import { readOrderItemsFromFormData } from "@/lib/admin/order-items";
import {
  RECORD_CONFLICT_RELOAD_HINT,
  isRecordConflictError,
  readExpectedUpdatedAt
} from "@/lib/admin/conflict-handling";
import {
  billingFormFieldName,
  getMissingEnquiryAddressFields,
  shippingFormFieldName,
  type EnquiryAddressView
} from "@/lib/enquiries/shared";
import { requireAdminPermission } from "@/services/auth";
import {
  addEnquiryNote,
  archiveEnquiry,
  closeEnquiry,
  markCheckoutOrderEnquiryContacted,
  markEnquiryContacted,
  markEnquiryComplete,
  markEnquiryInProgress,
  promoteCheckoutOrderEnquiry,
  promoteEnquiryToOrder,
  rejectEnquiry,
  requestEnquiryMissingInfo,
  restoreEnquiry,
  updateEnquiryAddress,
  updateEnquiryContactDetails,
  updateEnquiryMeta
} from "@/services/enquiries";

export type EnquiryActionResult = {
  ok: boolean;
  message: string;
  addressFields?: string[];
};

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function missingAddressFormFields(
  shipping: EnquiryAddressView,
  billing: EnquiryAddressView | null,
  billingSameAsShipping: boolean
) {
  const fields: string[] = getMissingEnquiryAddressFields(shipping).map(shippingFormFieldName);
  if (!billingSameAsShipping && billing) {
    fields.push(...getMissingEnquiryAddressFields(billing).map(billingFormFieldName));
  }
  return fields;
}

function orderApprovalUrl(orderId: string, message: string) {
  return `/admin/orders?order=${encodeURIComponent(orderId)}&queue=pending_verification&enquiry_status=success&enquiry_message=${encodeURIComponent(message)}`;
}

function actionError(error: unknown) {
  if (isRecordConflictError(error)) {
    return `This record was updated by someone else — reload and retry. ${RECORD_CONFLICT_RELOAD_HINT}`.slice(0, 240);
  }
  return (error instanceof Error ? error.message : String(error)).slice(0, 240);
}

function okResult(message: string): EnquiryActionResult {
  return { ok: true, message };
}

function errorResult(error: unknown, addressFields?: string[]): EnquiryActionResult {
  return {
    ok: false,
    message: actionError(error),
    ...(addressFields?.length ? { addressFields } : {})
  };
}

/**
 * In-place queue actions return a result instead of redirect()-ing back to the
 * same /admin/enquiries page. redirect() throws NEXT_REDIRECT, which does not
 * reliably settle useFormStatus pending on an already-mounted expanded row —
 * leaving buttons stuck on "Saving". Cross-page navigations (e.g. to /admin/orders)
 * still use redirect().
 */

export async function markEnquiryContactedFormAction(
  formData: FormData
): Promise<EnquiryActionResult | void> {
  const context = await requireAdminPermission("enquiries.write");
  const enquiryId = readString(formData, "enquiry_id");
  const orderId = readString(formData, "order_id");
  const queueKind = readString(formData, "queue_kind");
  const note = readString(formData, "note");

  try {
    if (queueKind === "checkout_order") {
      if (!orderId) throw new Error("Order id is required for checkout enquiries.");
      await markCheckoutOrderEnquiryContacted(orderId, context.userId!, note || undefined);
      await revalidateAfterMutation("enquiries", "orders");
      redirect(orderApprovalUrl(orderId, "Enquiry marked as contacted. Review the order to continue."));
    }

    if (!enquiryId) throw new Error("Enquiry id is required.");
    await markEnquiryContacted(
      enquiryId,
      context.userId!,
      context.userId!,
      note || undefined,
      process.env,
      { expectedUpdatedAt: readExpectedUpdatedAt(formData) }
    );
    await revalidateAfterMutation("enquiries");
    return okResult("Enquiry marked as contacted. Create the order when ready.");
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    return errorResult(error);
  }
}

export async function addEnquiryNoteFormAction(formData: FormData): Promise<EnquiryActionResult> {
  const context = await requireAdminPermission("enquiries.write");
  const enquiryId = readString(formData, "enquiry_id");
  const note = readString(formData, "note");

  try {
    if (!enquiryId) throw new Error("Enquiry id is required.");
    if (!note) throw new Error("A note is required.");
    await addEnquiryNote(enquiryId, context.userId!, note, process.env, {
      expectedUpdatedAt: readExpectedUpdatedAt(formData)
    });
    await revalidateAfterMutation("enquiries");
    return okResult("Note saved.");
  } catch (error) {
    return errorResult(error);
  }
}

/** @deprecated Use markEnquiryContactedFormAction */
export async function assignEnquiryFormAction(formData: FormData) {
  return markEnquiryContactedFormAction(formData);
}

export async function convertEnquiryToOrderFormAction(
  formData: FormData
): Promise<EnquiryActionResult | void> {
  const context = await requireAdminPermission("enquiries.write");
  const enquiryId = readString(formData, "enquiry_id");
  const orderId = readString(formData, "order_id");
  const queueKind = readString(formData, "queue_kind");

  try {
    let convertedOrderId = orderId;
    if (queueKind === "checkout_order") {
      if (!orderId) throw new Error("Order id is required for checkout enquiries.");
      const order = await promoteCheckoutOrderEnquiry(orderId, context.userId!);
      convertedOrderId = String(order?.id ?? orderId);
    } else {
      if (!enquiryId) throw new Error("Enquiry id is required.");
      const overrideItems = readOrderItemsFromFormData(formData);
      const order = await promoteEnquiryToOrder(enquiryId, context.userId!, process.env, overrideItems);
      convertedOrderId = String(order?.id ?? "");
      if (!convertedOrderId) throw new Error("Converted order id was not returned.");
    }
    await revalidateAfterMutation("enquiries", "orders");
    revalidatePath("/admin/orders");
    redirect(
      `/admin/orders?order=${encodeURIComponent(convertedOrderId)}&queue=all&enquiry_status=success&enquiry_message=${encodeURIComponent("Enquiry converted to order.")}`
    );
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    return errorResult(error);
  }
}

export async function closeEnquiryFormAction(formData: FormData): Promise<EnquiryActionResult> {
  const context = await requireAdminPermission("enquiries.write");
  const enquiryId = readString(formData, "enquiry_id");
  const note = readString(formData, "note");

  try {
    if (!enquiryId) throw new Error("Enquiry id is required.");
    await closeEnquiry(enquiryId, context.userId!, note || undefined, process.env, {
      expectedUpdatedAt: readExpectedUpdatedAt(formData)
    });
    await revalidateAfterMutation("enquiries");
    return okResult("Enquiry closed.");
  } catch (error) {
    return errorResult(error);
  }
}

export async function markEnquiryInProgressFormAction(formData: FormData): Promise<EnquiryActionResult> {
  const context = await requireAdminPermission("enquiries.write");
  const enquiryId = readString(formData, "enquiry_id");
  const note = readString(formData, "note");

  try {
    if (!enquiryId) throw new Error("Enquiry id is required.");
    await markEnquiryInProgress(enquiryId, context.userId!, note || undefined, process.env, {
      expectedUpdatedAt: readExpectedUpdatedAt(formData)
    });
    await revalidateAfterMutation("enquiries");
    return okResult("Enquiry marked as in progress.");
  } catch (error) {
    return errorResult(error);
  }
}

export async function markEnquiryCompleteFormAction(formData: FormData): Promise<EnquiryActionResult> {
  const context = await requireAdminPermission("enquiries.write");
  const enquiryId = readString(formData, "enquiry_id");
  const note = readString(formData, "note");

  try {
    if (!enquiryId) throw new Error("Enquiry id is required.");
    await markEnquiryComplete(enquiryId, context.userId!, note || undefined, process.env, {
      expectedUpdatedAt: readExpectedUpdatedAt(formData)
    });
    await revalidateAfterMutation("enquiries");
    return okResult("Enquiry marked as complete.");
  } catch (error) {
    return errorResult(error);
  }
}

export async function requestEnquiryMissingInfoFormAction(formData: FormData): Promise<EnquiryActionResult> {
  const context = await requireAdminPermission("enquiries.write");
  const enquiryId = readString(formData, "enquiry_id");
  const note = readString(formData, "note");

  try {
    if (!enquiryId) throw new Error("Enquiry id is required.");
    await requestEnquiryMissingInfo(enquiryId, context.userId!, note || undefined, process.env, {
      expectedUpdatedAt: readExpectedUpdatedAt(formData)
    });
    await revalidateAfterMutation("enquiries");
    return okResult("Missing information noted internally.");
  } catch (error) {
    return errorResult(error);
  }
}

export async function archiveEnquiryFormAction(formData: FormData): Promise<EnquiryActionResult> {
  const context = await requireAdminPermission("enquiries.write");
  const enquiryId = readString(formData, "enquiry_id");
  const note = readString(formData, "note");

  try {
    if (!enquiryId) throw new Error("Enquiry id is required.");
    await archiveEnquiry(enquiryId, context.userId!, note || undefined, process.env, {
      expectedUpdatedAt: readExpectedUpdatedAt(formData)
    });
    await revalidateAfterMutation("enquiries");
    return okResult("Enquiry archived.");
  } catch (error) {
    return errorResult(error);
  }
}

export async function rejectEnquiryFormAction(formData: FormData): Promise<EnquiryActionResult> {
  const context = await requireAdminPermission("enquiries.write");
  const enquiryId = readString(formData, "enquiry_id");
  const note = readString(formData, "note");

  try {
    if (!enquiryId) throw new Error("Enquiry id is required.");
    await rejectEnquiry(enquiryId, context.userId!, note || undefined, process.env, {
      expectedUpdatedAt: readExpectedUpdatedAt(formData)
    });
    await revalidateAfterMutation("enquiries");
    return okResult("Enquiry cancelled.");
  } catch (error) {
    return errorResult(error);
  }
}

export async function restoreEnquiryFormAction(formData: FormData): Promise<EnquiryActionResult> {
  const context = await requireAdminPermission("enquiries.write");
  const enquiryId = readString(formData, "enquiry_id");

  try {
    if (!enquiryId) throw new Error("Enquiry id is required.");
    await restoreEnquiry(enquiryId, context.userId!, process.env, {
      expectedUpdatedAt: readExpectedUpdatedAt(formData)
    });
    await revalidateAfterMutation("enquiries");
    return okResult("Enquiry restored.");
  } catch (error) {
    return errorResult(error);
  }
}

export async function updateEnquiryMetaFormAction(formData: FormData): Promise<EnquiryActionResult> {
  const context = await requireAdminPermission("enquiries.write");
  const enquiryId = readString(formData, "enquiry_id");

  try {
    if (!enquiryId) throw new Error("Enquiry id is required.");
    await updateEnquiryMeta(
      enquiryId,
      context.userId!,
      {
        priority: readString(formData, "priority"),
        assignedTo: readString(formData, "assigned_to"),
        followUpDate: readString(formData, "follow_up_date")
      }
    );
    await revalidateAfterMutation("enquiries");
    return okResult("Enquiry details updated.");
  } catch (error) {
    return errorResult(error);
  }
}

export async function updateEnquiryAddressFormAction(formData: FormData): Promise<EnquiryActionResult> {
  const context = await requireAdminPermission("enquiries.write");
  const enquiryId = readString(formData, "enquiry_id");
  const billingSameAsShipping = formData.get("billing_same_as_shipping") === "on"
    || formData.get("billing_same_as_shipping") === "true";

  try {
    if (!enquiryId) throw new Error("Enquiry id is required.");

    const shipping = {
      line1: readString(formData, "shipping_line1"),
      city: readString(formData, "shipping_city"),
      state: readString(formData, "shipping_state"),
      country: readString(formData, "shipping_country"),
      postalCode: readString(formData, "shipping_postal_code")
    };

    const billing = billingSameAsShipping
      ? null
      : {
        line1: readString(formData, "billing_line1"),
        city: readString(formData, "billing_city"),
        state: readString(formData, "billing_state"),
        country: readString(formData, "billing_country"),
        postalCode: readString(formData, "billing_postal_code")
      };

    await updateEnquiryAddress(
      enquiryId,
      context.userId!,
      {
        shipping,
        billing,
        billingSameAsShipping
      }
    );
    await revalidateAfterMutation("enquiries");
    return okResult("Customer address saved.");
  } catch (error) {
    const shippingView = {
      line1: readString(formData, "shipping_line1"),
      city: readString(formData, "shipping_city"),
      state: readString(formData, "shipping_state"),
      country: readString(formData, "shipping_country"),
      postalCode: readString(formData, "shipping_postal_code")
    };
    const billingView = billingSameAsShipping
      ? null
      : {
        line1: readString(formData, "billing_line1"),
        city: readString(formData, "billing_city"),
        state: readString(formData, "billing_state"),
        country: readString(formData, "billing_country"),
        postalCode: readString(formData, "billing_postal_code")
      };
    return errorResult(error, missingAddressFormFields(shippingView, billingView, billingSameAsShipping));
  }
}

/** In-place queue bridge — no redirect so expanded-row pending always clears. */
export async function updateEnquiryAddressClientAction(
  formData: FormData
): Promise<EnquiryActionResult> {
  return updateEnquiryAddressFormAction(formData);
}

export async function updateEnquiryContactDetailsFormAction(
  formData: FormData
): Promise<EnquiryActionResult> {
  const context = await requireAdminPermission("enquiries.write");
  const enquiryId = readString(formData, "enquiry_id");

  try {
    if (!enquiryId) throw new Error("Enquiry id is required.");
    await updateEnquiryContactDetails(enquiryId, context.userId!, {
      fullName: readString(formData, "customer_full_name"),
      phone: readString(formData, "customer_phone"),
      company: readString(formData, "customer_company")
    });
    await revalidateAfterMutation("enquiries");
    return okResult("Customer details saved.");
  } catch (error) {
    return errorResult(error);
  }
}
