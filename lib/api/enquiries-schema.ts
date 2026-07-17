import { isValidCustomerEmail, isValidCustomerPhone } from "@/lib/api/customer-contact";

export type EnquiryRequestBody = {
  subject: string;
  message: string;
  email: string;
  phone: string;
  fullName: string;
  company?: string | null;
  relatedProductSlug?: string | null;
  region?: string | null;
};

export function parseEnquiryRequestBody(body: unknown): EnquiryRequestBody | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.website === "string" && record.website.trim()) {
    return { subject: "", message: "", email: "", phone: "", fullName: "" };
  }

  const subject = typeof record.subject === "string" ? record.subject.trim() : "";
  const message = typeof record.message === "string" ? record.message.trim() : "";
  const email = typeof record.email === "string" ? record.email.trim() : "";
  const phone = typeof record.phone === "string" ? record.phone.trim() : "";
  const fullName = typeof record.fullName === "string" ? record.fullName.trim() : "";

  if (!subject || subject.length > 200) return null;
  if (!message || message.length > 5000) return null;
  if (!isValidCustomerEmail(email)) return null;
  if (!isValidCustomerPhone(phone) || phone.length > 40) return null;
  if (!fullName || fullName.length < 2 || fullName.length > 120) return null;

  const company = typeof record.company === "string" ? record.company.trim().slice(0, 160) : null;
  const relatedProductSlug = typeof record.relatedProductSlug === "string"
    ? record.relatedProductSlug.trim().slice(0, 120)
    : null;
  const region = typeof record.region === "string" ? record.region.trim().slice(0, 80) : null;

  return {
    subject,
    message,
    email,
    phone,
    fullName,
    ...(company ? { company } : {}),
    relatedProductSlug,
    region
  };
}
