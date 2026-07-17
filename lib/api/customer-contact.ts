/** Shared customer contact validation for checkout, enquiries, orders, signup, and profile. */

export type PhoneCountry = {
  code: string;
  dial: string;
  nationalLength: number;
  label: string;
};

/** Curated dial list — default India. */
export const PHONE_COUNTRIES: readonly PhoneCountry[] = [
  { code: "IN", dial: "91", nationalLength: 10, label: "India (+91)" },
  { code: "AE", dial: "971", nationalLength: 9, label: "UAE (+971)" },
  { code: "US", dial: "1", nationalLength: 10, label: "United States (+1)" },
  { code: "CA", dial: "1", nationalLength: 10, label: "Canada (+1)" },
  { code: "GB", dial: "44", nationalLength: 10, label: "United Kingdom (+44)" },
  { code: "SG", dial: "65", nationalLength: 8, label: "Singapore (+65)" },
  { code: "AU", dial: "61", nationalLength: 9, label: "Australia (+61)" }
] as const;

export const DEFAULT_PHONE_COUNTRY_CODE = "IN";

export function getPhoneCountry(code: string): PhoneCountry {
  return PHONE_COUNTRIES.find((entry) => entry.code === code) ?? PHONE_COUNTRIES[0];
}

export function getPhoneCountryByDial(dial: string): PhoneCountry | null {
  const normalized = dial.replace(/^\+/, "").trim();
  return PHONE_COUNTRIES.find((entry) => entry.dial === normalized) ?? null;
}

export function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

export function composeE164(dial: string, nationalDigits: string) {
  const dialDigits = digitsOnly(dial);
  const national = digitsOnly(nationalDigits);
  if (!dialDigits || !national) return "";
  return `+${dialDigits}${national}`;
}

export function validatePhoneWithCountry(countryCode: string, nationalDigits: string) {
  const country = getPhoneCountry(countryCode);
  const national = digitsOnly(nationalDigits);
  if (national.length !== country.nationalLength) {
    return {
      ok: false as const,
      error: `Enter a ${country.nationalLength}-digit ${country.label.split(" (")[0]} mobile number.`
    };
  }

  const e164 = composeE164(country.dial, national);
  if (!/^\+\d{8,15}$/.test(e164)) {
    return { ok: false as const, error: "Enter a valid phone number." };
  }

  return { ok: true as const, value: e164, country };
}

export function normalizeCustomerEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizeCustomerPhone(phone: string) {
  const digits = phone.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return `+91${digits}`;
  return digits.startsWith("91") && digits.length === 12 ? `+${digits}` : digits;
}

export function isValidCustomerEmail(email: string) {
  const trimmed = email.trim();
  if (!trimmed || trimmed.length > 320) return false;
  if (trimmed.includes(" ") || (trimmed.match(/@/g) ?? []).length !== 1) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export function isValidCustomerPhone(phone: string) {
  const normalized = normalizeCustomerPhone(phone);
  return /^\+\d{8,15}$/.test(normalized);
}

export function validateCustomerName(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 2) {
    return { ok: false as const, error: "Name is required." };
  }
  if (trimmed.length > 120) {
    return { ok: false as const, error: "Name must be between 2 and 120 characters." };
  }
  return { ok: true as const, value: trimmed };
}

export function validateCustomerEmail(value: string) {
  const normalized = normalizeCustomerEmail(value);
  if (!isValidCustomerEmail(normalized)) {
    return { ok: false as const, error: "Use a valid email like name@company.com." };
  }
  return { ok: true as const, value: normalized };
}

export function validateCustomerPhone(value: string) {
  const normalized = normalizeCustomerPhone(value);
  if (!isValidCustomerPhone(normalized)) {
    return { ok: false as const, error: "Enter a valid phone number with country code (8–15 digits)." };
  }
  return { ok: true as const, value: normalized };
}

/**
 * Split an E.164 value into country + national when it matches the curated list.
 */
export function splitE164ToCountry(phone: string): { countryCode: string; national: string } {
  const normalized = normalizeCustomerPhone(phone);
  if (!normalized.startsWith("+")) {
    return { countryCode: DEFAULT_PHONE_COUNTRY_CODE, national: digitsOnly(phone) };
  }

  // Longer dial codes first to avoid +1 vs +971 ambiguity incorrectly matching US.
  const sorted = [...PHONE_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  for (const country of sorted) {
    const prefix = `+${country.dial}`;
    if (normalized.startsWith(prefix)) {
      const national = normalized.slice(prefix.length);
      if (national.length === country.nationalLength) {
        return { countryCode: country.code, national };
      }
    }
  }

  return { countryCode: DEFAULT_PHONE_COUNTRY_CODE, national: digitsOnly(normalized.replace(/^\+/, "")) };
}

export function assertCustomerContact(email: string, phone: string) {
  if (!isValidCustomerEmail(email)) {
    throw new Error("A valid customer email is required.");
  }
  if (!isValidCustomerPhone(phone)) {
    throw new Error("A valid customer phone number is required.");
  }
}

export const CUSTOMER_CONTACT_REQUIRED_MESSAGE = "Email and phone number are required for all orders and enquiries.";

export const EMAIL_DELIVERY_UNAVAILABLE_MESSAGE =
  "Email delivery is temporarily unavailable. Please try again later.";
