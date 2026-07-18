"use server";

/** Legacy contact-request actions — use /admin/leads instead. */
async function removed(action: string): Promise<{ ok: false; message: string }> {
  return {
    ok: false,
    message: `${action} was removed. Use the Leads panel (/admin/leads) to push to order or delete.`
  };
}

export async function markContactRequestContactedFormAction() {
  return removed("markContactRequestContacted");
}
export async function markContactRequestInProgressFormAction() {
  return removed("markContactRequestInProgress");
}
export async function promoteContactRequestToOrderFormAction() {
  return removed("promoteContactRequestToOrder");
}
export async function rejectContactRequestFormAction() {
  return removed("rejectContactRequest");
}
export async function archiveContactRequestFormAction() {
  return removed("archiveContactRequest");
}
export async function restoreContactRequestFormAction() {
  return removed("restoreContactRequest");
}
export async function requestContactRequestMissingInfoFormAction() {
  return removed("requestContactRequestMissingInfo");
}
export async function updateContactRequestAddressFormAction() {
  return removed("updateContactRequestAddress");
}
export async function updateContactRequestAddressClientAction() {
  return removed("updateContactRequestAddress");
}
export async function updateContactRequestContactDetailsFormAction() {
  return removed("updateContactRequestContactDetails");
}
export async function linkContactRequestToOrderFormAction() {
  return removed("linkContactRequestToOrder");
}
