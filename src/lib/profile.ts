/** Strips a phone number down to digits, for storage and comparison. */
export function zelleDigits(input: string): string {
  return input.replace(/\D/g, "");
}

/**
 * Formats a US phone number for display, e.g. "5551234567" -> "(555) 123-4567".
 * Anything that isn't a recognisable 10/11-digit number is returned trimmed.
 */
export function formatZelle(input: string): string {
  const digits = zelleDigits(input);
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    const rest = digits.slice(1);
    return `+1 (${rest.slice(0, 3)}) ${rest.slice(3, 6)}-${rest.slice(6)}`;
  }
  return input.trim();
}

/** Zelle is optional, so an empty value is valid. */
export function isValidZelle(input: string): boolean {
  const digits = zelleDigits(input);
  if (digits.length === 0) return true;
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

export function isValidEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
}

/**
 * One-line summary of how to pay someone, e.g. "@handle · (555) 123-4567".
 * Empty when they haven't set up either method.
 */
export function payContactLine(
  member: { venmo: string; zelle: string } | null | undefined
): string {
  if (!member) return "";
  return [member.venmo, member.zelle].filter(Boolean).join(" · ");
}

/** Venmo handles are conventionally shown with a leading @. */
export function normalizeVenmo(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "") return "";
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}
