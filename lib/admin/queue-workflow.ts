/**
 * Legacy queue-workflow helpers retained for tests/adapters.
 * New admin lead UI uses Push to Order / Delete only.
 */

export type EnquiryPrimaryAction = "contact" | "convert" | "needsAddress" | "none";
export type EnquiryMoreAction = "requestInfo" | "cancel";

export type ContactRequestPrimaryAction = "contact" | "createOrder" | "none";
export type ContactRequestMoreAction = "requestInfo" | "reject";

export function enquiryMoreActionLabel(action: EnquiryMoreAction) {
  if (action === "requestInfo") return "Request missing information";
  if (action === "cancel") return "Delete";
  return action;
}

export function contactRequestMoreActionLabel(action: ContactRequestMoreAction) {
  if (action === "requestInfo") return "Request missing information";
  if (action === "reject") return "Delete";
  return action;
}

export function enquiryPrimaryAction() {
  return "convert" as const;
}

export function enquiryMoreActions() {
  return ["cancel"] as EnquiryMoreAction[];
}

export function enquiryNextStepLabel() {
  return "Push to order or delete";
}

export function contactRequestPrimaryAction() {
  return "createOrder" as const;
}

export function contactRequestMoreActions() {
  return ["reject"] as ContactRequestMoreAction[];
}

export function contactRequestNextStepLabel(request: { status?: string | null; converted_order_id?: string | null }) {
  if (request.converted_order_id || request.status === "converted") return "Order created";
  return "Push to order or delete";
}
