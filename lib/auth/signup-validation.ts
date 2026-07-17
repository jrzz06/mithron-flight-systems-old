import {
  normalizeCustomerEmail,
  normalizeCustomerPhone,
  validateCustomerEmail,
  validateCustomerName,
  validateCustomerPhone,
  validatePhoneWithCountry
} from "@/lib/api/customer-contact";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;
export const PASSWORD_RULES_HINT = "8+ characters, with a letter and a number";

export function normalizeSignupEmail(value: string) {
  return normalizeCustomerEmail(value);
}

export function normalizeSignupPhone(value: string) {
  return normalizeCustomerPhone(value);
}

export function validateSignupPhone(value: string) {
  return validateCustomerPhone(value);
}

export function validateSignupPhoneWithCountry(dialOrCode: string, nationalDigits: string) {
  return validatePhoneWithCountry(dialOrCode, nationalDigits);
}

export function validateSignupPassword(password: string, confirmPassword: string) {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false as const, error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return { ok: false as const, error: `Password must be at most ${PASSWORD_MAX_LENGTH} characters.` };
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return { ok: false as const, error: "Password must include at least one letter and one number." };
  }
  if (password !== confirmPassword) {
    return { ok: false as const, error: "Passwords do not match." };
  }
  return { ok: true as const };
}

export function validateSignupFullName(value: string) {
  return validateCustomerName(value);
}

export function validateSignupEmail(value: string) {
  return validateCustomerEmail(value);
}

export function rejectClientSuppliedRole(body: Record<string, unknown>) {
  const forbidden = ["role", "preferredRole", "preferred_role", "default_role"];
  for (const key of forbidden) {
    if (key in body && body[key] != null && body[key] !== "") {
      return "Role assignment is not allowed during registration.";
    }
  }
  return null;
}
