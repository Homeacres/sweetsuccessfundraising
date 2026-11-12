import { isEmail } from "@/lib/text";

export type PaymentMethod = "card" | "cash";

/** Digits only, so (403) 555-1234 and +1 403 555 1234 can be checked the same way. */
export function phoneDigits(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

/**
 * North American number: 10 digits, or 11 digits starting with 1.
 * Matches orders_buyer_phone_na_check. Symbols are ignored.
 */
export function isNorthAmericanPhone(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 40) return false;
  const digits = phoneDigits(trimmed);
  if (digits.length === 10) return true;
  return digits.length === 11 && digits.startsWith("1");
}

export function buyerContactError(input: {
  name: string;
  email: string;
  phone: string;
  method: PaymentMethod;
}): string | null {
  if (!input.name.trim()) return "Enter a name.";
  const email = input.email.trim();
  const phone = input.phone.trim();
  const emailOk = email.length > 0 && isEmail(email.toLowerCase());
  const phoneOk = phone.length > 0 && isNorthAmericanPhone(phone);
  if (phone && !phoneOk) return "Enter a 10-digit phone number.";
  if (email && !emailOk) return "Enter a valid email address.";
  if (input.method === "card" && !emailOk) return "Enter a valid email address.";
  if (!emailOk && !phoneOk) return "Enter an email or a phone number.";
  return null;
}
