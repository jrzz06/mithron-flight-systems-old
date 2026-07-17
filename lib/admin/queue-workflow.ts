import type { AdminContactRequestRow } from "@/lib/contact-requests/shared";
import { contactRequestHasShippingAddress } from "@/lib/contact-requests/shared";
import type { AdminEnquiryRow } from "@/lib/enquiries/shared";
import {
  enquiryHasShippingAddress,
  enquiryMissingShippingAddressSummary
} from "@/lib/enquiries/shared";

export type EnquiryPrimaryAction = "contact" | "convert" | "needsAddress" | "none";
export type EnquiryMoreAction =
  | "markInProgress"
  | "complete"
  | "requestInfo"
  | "close"
  | "cancel";

export type ContactRequestPrimaryAction = "contact" | "createOrder" | "none";
export type ContactRequestMoreAction =
  | "markInProgress"
  | "requestInfo"
  | "reject";

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function isTerminalEnquiryStatus(status: string) {
  return ["converted", "lost"].includes(status);
}

function isLinkedToOrder(record: unknown) {
  if (!record || typeof record !== "object") return false;
  return Boolean(text((record as Record<string, unknown>).converted_order_id));
}

function isTerminalContactRequestStatus(request: AdminContactRequestRow) {
  if (isLinkedToOrder(request)) return true;
  const status = text(request.status, "new");
  return status === "converted" || status === "rejected" || status === "archived";
}

export function enquiryPrimaryAction(enquiry: AdminEnquiryRow): EnquiryPrimaryAction {
  if (isLinkedToOrder(enquiry)) return "none";
  const status = text(enquiry.status, "new");
  if (status === "new") return "contact";
  if (status === "contacted" || status === "qualified" || status === "won") {
    return "convert";
  }
  return "none";
}

export function enquiryNextStepLabel(enquiry: AdminEnquiryRow) {
  const status = text(enquiry.status, "new");
  if (status === "converted" || isLinkedToOrder(enquiry)) return "Order created";
  if (status === "lost") return "Closed";
  if (status === "new") return "Contact customer";
  if (status === "contacted" || status === "qualified" || status === "won") {
    if (!enquiryHasShippingAddress(enquiry)) {
      const missing = enquiryMissingShippingAddressSummary(enquiry);
      return missing
        ? `Create order — address optional (missing: ${missing})`
        : "Create order — add address and products when available";
    }
    return "Create order";
  }
  return "Review";
}

export function enquiryPrimaryActionLabel(action: EnquiryPrimaryAction) {
  if (action === "contact") return "I contacted the customer";
  if (action === "convert") return "Create order";
  if (action === "needsAddress") return "";
  return "";
}

export function enquiryMoreActions(enquiry: AdminEnquiryRow): EnquiryMoreAction[] {
  const status = text(enquiry.status, "new");
  if (text(enquiry.queue_kind, "enquiry") !== "enquiry" || !text(enquiry.id)) return [];

  // Once linked to an order, Cancel/Close/Convert are dead actions even if status lags.
  if (isLinkedToOrder(enquiry) || isTerminalEnquiryStatus(status)) return [];

  const actions: EnquiryMoreAction[] = [];

  if (["contacted", "qualified"].includes(status)) {
    actions.push("markInProgress");
  }
  if (["contacted", "qualified", "won"].includes(status)) {
    actions.push("complete");
  }
  if (!enquiryHasShippingAddress(enquiry)) {
    actions.push("requestInfo");
  }
  if (status !== "lost") {
    actions.push("close", "cancel");
  }

  return Array.from(new Set(actions));
}

export function enquiryMoreActionLabel(action: EnquiryMoreAction) {
  if (action === "markInProgress") return "Mark as in progress";
  if (action === "complete") return "Complete";
  if (action === "requestInfo") return "Request missing information";
  if (action === "close") return "Not going ahead";
  if (action === "cancel") return "Cancel";
  return action;
}

export function enquirySupportsConvert(enquiry: AdminEnquiryRow) {
  return enquiryPrimaryAction(enquiry) === "convert";
}

export function contactRequestPrimaryAction(request: AdminContactRequestRow): ContactRequestPrimaryAction {
  if (isLinkedToOrder(request)) return "none";
  const status = text(request.status, "new");
  if (status === "converted" || status === "rejected" || status === "archived") return "none";
  if (status === "new") return "contact";
  if (["contacted", "qualified"].includes(status)) return "createOrder";
  return "none";
}

export function contactRequestNextStepLabel(request: AdminContactRequestRow) {
  const status = text(request.status, "new");
  if (status === "converted" || isLinkedToOrder(request)) return "Order created";
  if (status === "rejected") return "Not going ahead";
  if (status === "archived" || Boolean(request.archived_at)) return "Archived";
  if (status === "new") return "Contact customer";
  if (["contacted", "qualified"].includes(status)) {
    if (!contactRequestHasShippingAddress(request)) {
      return "Add shipping address or request missing information";
    }
    return "Push to order";
  }
  return "Review";
}

export function contactRequestPrimaryActionLabel(action: ContactRequestPrimaryAction) {
  if (action === "contact") return "I contacted the customer";
  if (action === "createOrder") return "Convert to order";
  return "";
}

export function contactRequestMoreActions(request: AdminContactRequestRow): ContactRequestMoreAction[] {
  const status = text(request.status, "new");
  const primary = contactRequestPrimaryAction(request);
  if (primary === "none" || isTerminalContactRequestStatus(request)) return [];

  const actions: ContactRequestMoreAction[] = [];

  if (["new", "contacted"].includes(status)) {
    actions.push("markInProgress");
  }
  if (!contactRequestHasShippingAddress(request)) {
    actions.push("requestInfo");
  }
  if (!["rejected", "converted"].includes(status)) {
    actions.push("reject");
  }

  return Array.from(new Set(actions));
}

export function contactRequestMoreActionLabel(action: ContactRequestMoreAction) {
  if (action === "markInProgress") return "Mark as in progress";
  if (action === "requestInfo") return "Request missing information";
  if (action === "reject") return "Cancel";
  return action;
}
