const maximumServicePriceCents = 10_000_000;

export function parseBrazilianRealToCents(value: string): number | undefined {
  const normalized = value.trim().replace(/^R\$\s*/, "");
  const match = normalized.match(/^(?<integer>\d{1,3}(?:\.\d{3})*|\d+)(?:,(?<fraction>\d{1,2}))?$/);

  if (!match?.groups) return undefined;

  const integer = match.groups.integer.replaceAll(".", "");
  const fraction = (match.groups.fraction ?? "").padEnd(2, "0");
  const cents = Number(`${integer}${fraction}`);

  return Number.isSafeInteger(cents) && cents <= maximumServicePriceCents ? cents : undefined;
}

export function formatBrazilianReal(cents: number): string {
  const digits = cents.toString().padStart(3, "0");
  const integer = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$\u00a0${integer},${digits.slice(-2)}`;
}
