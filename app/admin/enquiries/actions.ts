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

type FeedbackContext = {
  enquiryId?: string;
  listStatus?: string;
  listQuery?: string;
  addressFields?: string[];
};

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function readListContext(formData: FormData): Pick<FeedbackContext, "listStatus" | "listQuery"> {
  return {
    listStatus: readString(formData, "list_status") || undefined,
    listQuery: readString(formData, "list_q") || undefined
  };
}

function feedbackUrl(
  status: "success" | "error",
  message: string,
  context: FeedbackContext = {}
) {
  const params = new URLSearchParams();
  if (context.listStatus) params.set("status", context.listStatus);
  if (context.listQuery) params.set("q", context.listQuery);
  if (context.enquiryId) {
    params.set("open", context.enquiryId);
    params.set("enquiry_id", context.enquiryId);
  }
  if (context.addressFields?.length) {
    params.set("address_fields", context.addressFields.join(","));
  }
  params.set("enquiry_status", status);
  params.set("enquiry_message", message);
  return `/admin/enquiries?${params.toString()}`;
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

export async function markEnquiryContactedFormAction(formData: FormData) {
  const context = await requireAdminPermission("enquiries.write");
  const enquiryId = readString(formData, "enquiry_id");
  const orderId = readString(formData, "order_id");
  const queueKind = readString(formData, "queue_kind");
  const note = readString(formData, "note");
  const listContext = readListContext(formData);

  try {
    if (queueKind === "checkout_order") {
      if (!orderId) throw new Error("Order id is required for checkout enquiries.");
      await markCheckoutOrderEnquiryContacted(orderId, context.userId!, note || undefined);
      await revalidateAfterMutation("enquiries", "orders");
      redirect(orderApprovalUrl(orderId, "Enquiry marked as contacted. Review the order to continue."));
    } else {
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
      redirect(
        feedbackUrl(
          "success",
          "Enquiry marked as contacted. Create the order when ready.",
          {
            enquiryId,
            listStatus: "contacted",
            listQuery: listContext.listQuery
          }
        )
      );
    }
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(
      feedbackUrl("error", actionError(error), {
        enquiryId: enquiryId || undefined,
        listStatus: listContext.listStatus,
        listQuery: listContext.listQuery
      })
    );
  }
}

export async function addEnquiryNoteFormAction(formData: FormData) {
  const context = await requireAdminPermission("enquiries.write");
  const enquiryId = readString(formData, "enquiry_id");
  const note = readString(formData, "note");
  const listContext = readListContext(formData);

  try {
    if (!enquiryId) throw new Error("Enquiry id is required.");
    if (!note) throw new Error("A note is required.");
    await addEnquiryNote(enquiryId, context.userId!, note, process.env, {
      expectedUpdatedAt: readExpectedUpdatedAt(formData)
    });
    await revalidateAfterMutation("enquiries");
    redirect(
      feedbackUrl("success", "Note saved.", {
        enquiryId,
        listStatus: listContext.listStatus,
        listQuery: listContext.listQuery
      })
    );
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(
      feedbackUrl("error", actionError(error), {
        enquiryId: enquiryId || undefined,
        listStatus: listContext.listStatus,
        listQuery: listContext.listQuery
      })
    );
  }
}

/** @deprecated Use markEnquiryContactedFormAction */
export async function assignEnquiryFormAction(formData: FormData) {
  return markEnquiryContactedFormAction(formData);
}

export async function convertEnquiryToOrderFormAction(formData: FormData) {
  const context = await requireAdminPermission("enquiries.write");
  const enquiryId = readString(formData, "enquiry_id");
  const orderId = readString(formData, "order_id");
  const queueKind = readString(formData, "queue_kind");
  const listContext = readListContext(formData);

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
    redirect(
      feedbackUrl("error", actionError(error), {
        enquiryId: enquiryId || undefined,
        listStatus: listContext.listStatus,
        listQuery: listContext.listQuery
      })
    );
  }
}

export async function closeEnquiryFormAction(formData: FormData) {
  const context = await requireAdminPermission("enquiries.write");
  const enquiryId = readString(formData, "enquiry_id");
  const note = readString(formData, "note");
  const listContext = readListContext(formData);

  try {
    if (!enquiryId) throw new Error("Enquiry id is required.");
    await closeEnquiry(enquiryId, context.userId!, note || undefined, process.env, {
      expectedUpdatedAt: readExpectedUpdatedAt(formData)
    });
    await revalidateAfterMutation("enquiries");
    redirect(
      feedbackUrl("success", "Enquiry closed.", {
        enquiryId,
        listStatus: listContext.listStatus || "lost",
        listQuery: listContext.listQuery
      })
    );
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(
      feedbackUrl("error", actionError(error), {
        enquiryId: enquiryId || undefined,
        listStatus: listContext.listStatus,
        listQuery: listContext.listQuery
      })
    );
  }
}

export async function markEnquiryInProgressFormAction(formData: FormData) {
  const context = await requireAdminPermission("enquiries.write");
  const enquiryId = readString(formData, "enquiry_id");
  const note = readString(formData, "note");
  const listContext = readListContext(formData);

  try {
    if (!enquiryId) throw new Error("Enquiry id is required.");
    await markEnquiryInProgress(enquiryId, context.userId!, note || undefined, process.env, {
      expectedUpdatedAt: readExpectedUpdatedAt(formData)
    });
    await revalidateAfterMutation("enquiries");
    redirect(
      feedbackUrl("success", "Enquiry marked as in progress.", {
        enquiryId,
        listStatus: listContext.listStatus || "qualified",
        listQuery: listContext.listQuery
      })
    );
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(
      feedbackUrl("error", actionError(error), {
        enquiryId: enquiryId || undefined,
        listStatus: listContext.listStatus,
        listQuery: listContext.listQuery
      })
    );
  }
}

export async function markEnquiryCompleteFormAction(formData: FormData) {
  const context = await requireAdminPermission("enquiries.write");
  const enquiryId = readString(formData, "enquiry_id");
  const note = readString(formData, "note");
  const listContext = readListContext(formData);

  try {
    if (!enquiryId) throw new Error("Enquiry id is required.");
    await markEnquiryComplete(enquiryId, context.userId!, note || undefined, process.env, {
      expectedUpdatedAt: readExpectedUpdatedAt(formData)
    });
    await revalidateAfterMutation("enquiries");
    redirect(
      feedbackUrl("success", "Enquiry marked as complete.", {
        enquiryId,
        listStatus: listContext.listStatus,
        listQuery: listContext.listQuery
      })
    );
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(
      feedbackUrl("error", actionError(error), {
        enquiryId: enquiryId || undefined,
        listStatus: listContext.listStatus,
        listQuery: listContext.listQuery
      })
    );
  }
}

export async function requestEnquiryMissingInfoFormAction(formData: FormData) {
  const context = await requireAdminPermission("enquiries.write");
  const enquiryId = readString(formData, "enquiry_id");
  const note = readString(formData, "note");
  const listContext = readListContext(formData);

  try {
    if (!enquiryId) throw new Error("Enquiry id is required.");
    await requestEnquiryMissingInfo(enquiryId, context.userId!, note || undefined, process.env, {
      expectedUpdatedAt: readExpectedUpdatedAt(formData)
    });
    await revalidateAfterMutation("enquiries");
    redirect(
      feedbackUrl("success", "Missing information noted internally.", {
        enquiryId,
        listStatus: listContext.listStatus,
        listQuery: listContext.listQuery
      })
    );
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(
      feedbackUrl("error", actionError(error), {
        enquiryId: enquiryId || undefined,
        listStatus: listContext.listStatus,
        listQuery: listContext.listQuery
      })
    );
  }
}

export async function archiveEnquiryFormAction(formData: FormData) {
  const context = await requireAdminPermission("enquiries.write");
  const enquiryId = readString(formData, "enquiry_id");
  const note = readString(formData, "note");
  const listContext = readListContext(formData);

  try {
    if (!enquiryId) throw new Error("Enquiry id is required.");
    await archiveEnquiry(enquiryId, context.userId!, note || undefined, process.env, {
      expectedUpdatedAt: readExpectedUpdatedAt(formData)
    });
    await revalidateAfterMutation("enquiries");
    redirect(
      feedbackUrl("success", "Enquiry archived.", {
        enquiryId,
        listStatus: listContext.listStatus,
        listQuery: listContext.listQuery
      })
    );
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(
      feedbackUrl("error", actionError(error), {
        enquiryId: enquiryId || undefined,
        listStatus: listContext.listStatus,
        listQuery: listContext.listQuery
      })
    );
  }
}

export async function rejectEnquiryFormAction(formData: FormData) {
  const context = await requireAdminPermission("enquiries.write");
  const enquiryId = readString(formData, "enquiry_id");
  const note = readString(formData, "note");
  const listContext = readListContext(formData);

  try {
    if (!enquiryId) throw new Error("Enquiry id is required.");
    await rejectEnquiry(enquiryId, context.userId!, note || undefined, process.env, {
      expectedUpdatedAt: readExpectedUpdatedAt(formData)
    });
    await revalidateAfterMutation("enquiries");
    redirect(
      feedbackUrl("success", "Enquiry cancelled.", {
        enquiryId,
        listStatus: listContext.listStatus || "lost",
        listQuery: listContext.listQuery
      })
    );
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(
      feedbackUrl("error", actionError(error), {
        enquiryId: enquiryId || undefined,
        listStatus: listContext.listStatus,
        listQuery: listContext.listQuery
      })
    );
  }
}

export async function restoreEnquiryFormAction(formData: FormData) {
  const context = await requireAdminPermission("enquiries.write");
  const enquiryId = readString(formData, "enquiry_id");
  const listContext = readListContext(formData);

  try {
    if (!enquiryId) throw new Error("Enquiry id is required.");
    await restoreEnquiry(enquiryId, context.userId!, process.env, {
      expectedUpdatedAt: readExpectedUpdatedAt(formData)
    });
    await revalidateAfterMutation("enquiries");
    redirect(
      feedbackUrl("success", "Enquiry restored.", {
        enquiryId,
        listStatus: listContext.listStatus || "new",
        listQuery: listContext.listQuery
      })
    );
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(
      feedbackUrl("error", actionError(error), {
        enquiryId: enquiryId || undefined,
        listStatus: listContext.listStatus,
        listQuery: listContext.listQuery
      })
    );
  }
}

export async function updateEnquiryMetaFormAction(formData: FormData) {
  const context = await requireAdminPermission("enquiries.write");
  const enquiryId = readString(formData, "enquiry_id");
  const listContext = readListContext(formData);

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
    redirect(
      feedbackUrl("success", "Enquiry details updated.", {
        enquiryId,
        listStatus: listContext.listStatus,
        listQuery: listContext.listQuery
      })
    );
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(
      feedbackUrl("error", actionError(error), {
        enquiryId: enquiryId || undefined,
        listStatus: listContext.listStatus,
        listQuery: listContext.listQuery
      })
    );
  }
}

export async function updateEnquiryAddressFormAction(formData: FormData) {
  const context = await requireAdminPermission("enquiries.write");
  const enquiryId = readString(formData, "enquiry_id");
  const listContext = readListContext(formData);
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
    redirect(
      feedbackUrl("success", "Customer address saved.", {
        enquiryId,
        listStatus: listContext.listStatus,
        listQuery: listContext.listQuery
      })
    );
  } catch (error) {
    if (isNextRedirect(error)) throw error;
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
    redirect(
      feedbackUrl("error", actionError(error), {
        enquiryId: enquiryId || undefined,
        listStatus: listContext.listStatus,
        listQuery: listContext.listQuery,
        addressFields: missingAddressFormFields(shippingView, billingView, billingSameAsShipping)
      })
    );
  }
}

export async function updateEnquiryContactDetailsFormAction(formData: FormData) {
  const context = await requireAdminPermission("enquiries.write");
  const enquiryId = readString(formData, "enquiry_id");
  const listContext = readListContext(formData);

  try {
    if (!enquiryId) throw new Error("Enquiry id is required.");
    await updateEnquiryContactDetails(enquiryId, context.userId!, {
      fullName: readString(formData, "customer_full_name"),
      phone: readString(formData, "customer_phone"),
      company: readString(formData, "customer_company")
    });
    await revalidateAfterMutation("enquiries");
    redirect(
      feedbackUrl("success", "Customer details saved.", {
        enquiryId,
        listStatus: listContext.listStatus,
        listQuery: listContext.listQuery
      })
    );
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(
      feedbackUrl("error", actionError(error), {
        enquiryId: enquiryId || undefined,
        listStatus: listContext.listStatus,
        listQuery: listContext.listQuery
      })
    );
  }
}
