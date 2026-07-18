"use server";

/** Legacy enquiry actions — use /admin/leads instead. */
async function removed(action: string): Promise<{ ok: false; message: string }> {
  return {
    ok: false,
    message: `${action} was removed. Use the Leads panel (/admin/leads) to push to order or delete.`
  };
}

export async function markEnquiryContactedFormAction() {
  return removed("markEnquiryContacted");
}
export async function markEnquiryInProgressFormAction() {
  return removed("markEnquiryInProgress");
}
export async function markEnquiryCompleteFormAction() {
  return removed("markEnquiryComplete");
}
export async function convertEnquiryToOrderFormAction() {
  return removed("convertEnquiryToOrder");
}
export async function promoteEnquiryToOrderFormAction() {
  return removed("promoteEnquiryToOrder");
}
export async function rejectEnquiryFormAction() {
  return removed("rejectEnquiry");
}
export async function closeEnquiryFormAction() {
  return removed("closeEnquiry");
}
export async function archiveEnquiryFormAction() {
  return removed("archiveEnquiry");
}
export async function restoreEnquiryFormAction() {
  return removed("restoreEnquiry");
}
export async function requestEnquiryMissingInfoFormAction() {
  return removed("requestEnquiryMissingInfo");
}
export async function updateEnquiryAddressFormAction() {
  return removed("updateEnquiryAddress");
}
export async function updateEnquiryAddressClientAction() {
  return removed("updateEnquiryAddress");
}
export async function updateEnquiryContactDetailsFormAction() {
  return removed("updateEnquiryContactDetails");
}
export async function updateEnquiryMetaFormAction() {
  return removed("updateEnquiryMeta");
}
export async function addEnquiryNoteFormAction() {
  return removed("addEnquiryNote");
}
export async function markCheckoutOrderEnquiryContactedFormAction() {
  return removed("markCheckoutOrderEnquiryContacted");
}
export async function promoteCheckoutOrderEnquiryFormAction() {
  return removed("promoteCheckoutOrderEnquiry");
}
