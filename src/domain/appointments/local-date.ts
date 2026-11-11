import { BUSINESS_HOURS_TIME_ZONE } from "../business-hours/business-hours";
import { AppointmentRuleError, localDateSchema, utcInstantSchema } from "./appointment";

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_HOURS_TIME_ZONE,
  calendar: "gregory",
  numberingSystem: "latn",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  era: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function localParts(milliseconds: number) {
  const parts = Object.fromEntries(
    formatter.formatToParts(milliseconds).map(({ type, value }) => [type, value]),
  );
  const year = parts.era === "BC" ? 1 - Number(parts.year) : Number(parts.year);
  return {
    year,
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function dateNumber(milliseconds: number): number {
  const parts = localParts(milliseconds);
  return parts.year * 10000 + parts.month * 100 + parts.day;
}

function invalidRange(): never {
  throw new AppointmentRuleError("INVALID_TIME_RANGE", "Informe uma data ou um horário válido.");
}

export function getLocalDate(instant: string): string {
  const parsed = utcInstantSchema.safeParse(instant);
  if (!parsed.success) return invalidRange();
  const parts = localParts(Date.parse(parsed.data));
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function getLocalDayBounds(date: string): { startAt: string; endAt: string } {
  if (!localDateSchema.safeParse(date).success) return invalidRange();
  const nominalMidnight = Date.parse(`${date}T00:00:00.000Z`);
  const wanted = Number(date.replaceAll("-", ""));
  // Search real instants: local midnight may not exist, and a day need not last 24h.
  // A fixed 72h bracket bounds both searches independently of caller input.
  const boundary = (after: boolean) => {
    let low = nominalMidnight - 36 * 3600000;
    let high = nominalMidnight + 36 * 3600000;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      const value = dateNumber(middle);
      if (after ? value > wanted : value >= wanted) high = middle;
      else low = middle + 1;
    }
    return new Date(low).toISOString();
  };
  return { startAt: boundary(false), endAt: boundary(true) };
}

export function getLocalTimeInstant(
  date: string,
  time: string,
  disambiguation: "earlier" | "later",
): string {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return invalidRange();
  const bounds = getLocalDayBounds(date);
  const start = Date.parse(bounds.startAt);
  const end = Date.parse(bounds.endAt);
  const nominal = Date.parse(`${date}T${time}:00.000Z`);
  // São Paulo's offset changes are represented by the offsets on each side of
  // the local day. Verify candidates rather than shifting nonexistent times.
  const candidates = new Set<number>();
  for (const sample of [start, end - 1000]) {
    const parts = localParts(sample);
    const local = new Date(0);
    local.setUTCFullYear(parts.year, parts.month - 1, parts.day);
    local.setUTCHours(parts.hour, parts.minute, parts.second, 0);
    const offset = local.getTime() - sample;
    const candidate = nominal - offset;
    const actual = localParts(candidate);
    if (
      candidate >= start &&
      candidate < end &&
      actual.hour === Number(time.slice(0, 2)) &&
      actual.minute === Number(time.slice(3)) &&
      actual.second === 0
    )
      candidates.add(candidate);
  }
  if (candidates.size === 0) return invalidRange();
  return new Date(
    disambiguation === "earlier" ? Math.min(...candidates) : Math.max(...candidates),
  ).toISOString();
}
