/**
 * Canonical phone key used as the identity of a client inside a salon.
 * Returns null when the value cannot be a phone number.
 *
 * - 10 or 11 digits (Brazilian DDD + number): prefixed with country code 55.
 * - 12 or 13 digits starting with 55: kept.
 * - Any other length from 10 to 15 digits: kept as is (international).
 * The legacy "ninth digit" is intentionally not handled.
 */
export function normalizeBrazilianPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length >= 12 && digits.length <= 15) return digits;
  return null;
}
