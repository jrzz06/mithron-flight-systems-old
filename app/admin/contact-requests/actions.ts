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
  getMissingContactRequestAddressFields,
  shippingFormFieldName,
  type ContactRequestAddressView
} from "@/lib/contact-requests/shared";
import { requireAdminPermission } from "@/services/auth";
import {
  archiveContactRequest,
  linkContactRequestToOrder,
  markContactRequestContacted,
  markContactRequestInProgress,
  promoteContactRequestToOrder,
  rejectContactRequest,
  requestContactRequestMissingInfo,
  restoreContactRequest,
  updateContactRequestAddress,
  updateContactRequestContactDetails
} from "@/services/contact-requests";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function feedbackUrl(
  status: "success" | "error" | "warning",
  message: string,
  context: { contactRequestId?: string; addressFields?: string[]; listStatus?: string } = {}
) {
  const params = new URLSearchParams();
  if (context.contactRequestId) {
    params.set("open", context.contactRequestId);
    params.set("contact_request_id", context.contactRequestId);
  }
  if (context.listStatus) params.set("status", context.listStatus);
  if (context.addressFields?.length) {
    params.set("address_fields", context.addressFields.join(","));
  }
  params.set("request_status", status);
  params.set("request_message", message);
  return `/admin/contact-requests?${params.toString()}`;
}

function readListContext(formData: FormData) {
  return String(formData.get("list_status") ?? "").trim() || undefined;
}

function orderRedirectUrl(orderId: string, status: string, message: string) {
  const queue = status === "draft" ? "active" : "pending_verification";
  return `/admin/orders?order=${encodeURIComponent(orderId)}&queue=${queue}&order_status=success&order_message=${encodeURIComponent(message)}`;
}

function actionError(error: unknown) {
  if (isRecordConflictError(error)) {
    return `This record was updated by someone else — reload and retry. ${RECORD_CONFLICT_RELOAD_HINT}`.slice(0, 240);
  }
  return (error instanceof Error ? error.message : String(error)).slice(0, 240);
}

function missingAddressFormFields(
  shipping: ContactRequestAddressView,
  billing: ContactRequestAddressView | null,
  billingSameAsShipping: boolean
) {
  const fields: string[] = getMissingContactRequestAddressFields(shipping).map(shippingFormFieldName);
  if (!billingSameAsShipping && billing) {
    fields.push(...getMissingContactRequestAddressFields(billing).map(billingFormFieldName));
  }
  return fields;
}

export async function markContactRequestContactedFormAction(formData: FormData) {
  const context = await requireAdminPermission("enquiries.write");
  const contactRequestId = readString(formData, "contact_request_id");
  const note = readString(formData, "note");
  const listStatus = readListContext(formData);

  try {
    if (!contactRequestId) throw new Error("Contact request id is required.");
    await markContactRequestContacted(
      contactRequestId,
      context.userId!,
      context.userId!,
      note || undefined,
      process.env,
      { expectedUpdatedAt: readExpectedUpdatedAt(formData) }
    );

    try {
      const order = await promoteContactRequestToOrder(contactRequestId, context.userId!);
      await revalidateAfterMutation("contact_requests", "orders");
      revalidatePath("/admin/orders");
      redirect(
        orderRedirectUrl(
          order.order_id,
          order.status,
          "Contact request marked as contacted and pushed to orders."
        )
      );
    } catch (conversionError) {
      if (isNextRedirect(conversionError)) throw conversionError;
      await revalidateAfterMutation("contact_requests");
      redirect(
        feedbackUrl(
          "warning",
          `Contact request marked as contacted. ${actionError(conversionError)}`,
          { contactRequestId, listStatus }
        )
      );
    }
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackUrl("error", actionError(error), { contactRequestId: contactRequestId || undefined, listStatus }));
  }
}

export async function promoteContactRequestToOrderFormAction(formData: FormData) {
  const context = await requireAdminPermission("enquiries.write");
  const contactRequestId = readString(formData, "contact_request_id");

  try {
    if (!contactRequestId) throw new Error("Contact request id is required.");
    const overrideItems = readOrderItemsFromFormData(formData);
    const order = await promoteContactRequestToOrder(contactRequestId, context.userId!, process.env, overrideItems);
    await revalidateAfterMutation("contact_requests", "orders");
    revalidatePath("/admin/orders");
    redirect(
      orderRedirectUrl(
        order.order_id,
        order.status,
        order.idempotent
          ? "Contact request is already linked to an order."
          : "Contact request pushed to orders."
      )
    );
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackUrl("error", actionError(error), { contactRequestId: contactRequestId || undefined }));
  }
}

export async function markContactRequestInProgressFormAction(formData: FormData) {
  const context = await requireAdminPermission("enquiries.write");
  const contactRequestId = readString(formData, "contact_request_id");
  const note = readString(formData, "note");
  const listStatus = readListContext(formData);

  try {
    if (!contactRequestId) throw new Error("Contact request id is required.");
    await markContactRequestInProgress(contactRequestId, context.userId!, note || undefined, process.env, {
      expectedUpdatedAt: readExpectedUpdatedAt(formData)
    });
    await revalidateAfterMutation("contact_requests");
    redirect(feedbackUrl("success", "Contact request marked as in progress.", { contactRequestId, listStatus }));
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackUrl("error", actionError(error), { contactRequestId: contactRequestId || undefined, listStatus }));
  }
}

export async function requestContactRequestMissingInfoFormAction(formData: FormData) {
  const context = await requireAdminPermission("enquiries.write");
  const contactRequestId = readString(formData, "contact_request_id");
  const note = readString(formData, "note");
  const listStatus = readListContext(formData);

  try {
    if (!contactRequestId) throw new Error("Contact request id is required.");
    await requestContactRequestMissingInfo(contactRequestId, context.userId!, note || undefined, process.env, {
      expectedUpdatedAt: readExpectedUpdatedAt(formData)
    });
    await revalidateAfterMutation("contact_requests");
    redirect(
      feedbackUrl("success", "Missing information noted internally.", { contactRequestId, listStatus })
    );
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackUrl("error", actionError(error), { contactRequestId: contactRequestId || undefined, listStatus }));
  }
}

export async function updateContactRequestAddressFormAction(formData: FormData) {
  const context = await requireAdminPermission("enquiries.write");
  const contactRequestId = readString(formData, "contact_request_id");
  const billingSameAsShipping = formData.get("billing_same_as_shipping") === "on"
    || formData.get("billing_same_as_shipping") === "true";

  try {
    if (!contactRequestId) throw new Error("Contact request id is required.");

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

    await updateContactRequestAddress(
      contactRequestId,
      context.userId!,
      {
        shipping,
        billing,
        billingSameAsShipping
      }
    );
    await revalidateAfterMutation("contact_requests");
    redirect(feedbackUrl("success", "Customer address saved.", { contactRequestId }));
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
        contactRequestId: contactRequestId || undefined,
        addressFields: missingAddressFormFields(shippingView, billingView, billingSameAsShipping)
      })
    );
  }
}

export async function archiveContactRequestFormAction(formData: FormData) {
  const context = await requireAdminPermission("enquiries.write");
  const contactRequestId = readString(formData, "contact_request_id");
  const note = readString(formData, "note");
  const listStatus = readListContext(formData);

  try {
    if (!contactRequestId) throw new Error("Contact request id is required.");
    await archiveContactRequest(contactRequestId, context.userId!, note || undefined, process.env, {
      expectedUpdatedAt: readExpectedUpdatedAt(formData)
    });
    await revalidateAfterMutation("contact_requests");
    redirect(feedbackUrl("success", "Contact request archived.", { contactRequestId, listStatus }));
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackUrl("error", actionError(error), { contactRequestId: contactRequestId || undefined, listStatus }));
  }
}

export async function rejectContactRequestFormAction(formData: FormData) {
  const context = await requireAdminPermission("enquiries.write");
  const contactRequestId = readString(formData, "contact_request_id");
  const note = readString(formData, "note");
  const listStatus = readListContext(formData);

  try {
    if (!contactRequestId) throw new Error("Contact request id is required.");
    await rejectContactRequest(contactRequestId, context.userId!, note || undefined, process.env, {
      expectedUpdatedAt: readExpectedUpdatedAt(formData)
    });
    await revalidateAfterMutation("contact_requests");
    redirect(feedbackUrl("success", "Contact request cancelled.", { contactRequestId, listStatus }));
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackUrl("error", actionError(error), { contactRequestId: contactRequestId || undefined, listStatus }));
  }
}

export async function restoreContactRequestFormAction(formData: FormData) {
  const context = await requireAdminPermission("enquiries.write");
  const contactRequestId = readString(formData, "contact_request_id");
  const listStatus = readListContext(formData);

  try {
    if (!contactRequestId) throw new Error("Contact request id is required.");
    await restoreContactRequest(contactRequestId, context.userId!, process.env, {
      expectedUpdatedAt: readExpectedUpdatedAt(formData)
    });
    await revalidateAfterMutation("contact_requests");
    redirect(feedbackUrl("success", "Contact request restored.", { contactRequestId, listStatus: listStatus || "new" }));
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackUrl("error", actionError(error), { contactRequestId: contactRequestId || undefined, listStatus }));
  }
}

export async function linkContactRequestToOrderFormAction(formData: FormData) {
  const context = await requireAdminPermission("enquiries.write");
  const contactRequestId = readString(formData, "contact_request_id");
  const orderId = readString(formData, "order_id");

  try {
    if (!contactRequestId) throw new Error("Contact request id is required.");
    if (!orderId) throw new Error("Order id is required.");
    await linkContactRequestToOrder(contactRequestId, orderId, context.userId!);
    await revalidateAfterMutation("contact_requests", "orders");
    revalidatePath("/admin/orders");
    redirect(
      `/admin/orders?order=${encodeURIComponent(orderId)}&queue=pending_verification&request_status=success&request_message=${encodeURIComponent("Contact request linked to order.")}`
    );
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackUrl("error", actionError(error), { contactRequestId: contactRequestId || undefined }));
  }
}

export async function updateContactRequestContactDetailsFormAction(formData: FormData) {
  const context = await requireAdminPermission("enquiries.write");
  const contactRequestId = readString(formData, "contact_request_id");

  try {
    if (!contactRequestId) throw new Error("Contact request id is required.");
    await updateContactRequestContactDetails(contactRequestId, context.userId!, {
      fullName: readString(formData, "customer_full_name"),
      phone: readString(formData, "customer_phone"),
      company: readString(formData, "customer_company")
    });
    await revalidateAfterMutation("contact_requests");
    redirect(feedbackUrl("success", "Customer details saved.", { contactRequestId }));
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    redirect(feedbackUrl("error", actionError(error), { contactRequestId: contactRequestId || undefined }));
  }
}
