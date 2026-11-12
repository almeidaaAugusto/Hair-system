import type { AppointmentRuleErrorCode } from "@/domain/appointments/appointment";
import type { AvailabilityWindow } from "@/domain/appointments/availability";
import { getLocalDate, getLocalTimeInstant } from "@/domain/appointments/local-date";
import { BUSINESS_HOURS_TIME_ZONE } from "@/domain/business-hours/business-hours";

export type AgendaView = "day" | "week" | "month";
export type AgendaRange = { from: string; to: string };

const DAY_MS = 86_400_000;

function toUtcNoon(date: string): Date {
  return new Date(`${date}T12:00:00.000Z`);
}

function toDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Calendar arithmetic on local date strings (YYYY-MM-DD); independent of time zone. */
export function addDays(date: string, days: number): string {
  return toDateString(new Date(toUtcNoon(date).getTime() + days * DAY_MS));
}

export function addMonths(date: string, months: number): string {
  const value = toUtcNoon(date);
  const day = value.getUTCDate();
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0, 12),
  ).getUTCDate();
  value.setUTCDate(Math.min(day, lastDay));
  return toDateString(value);
}

/** Weeks start on Monday, matching the Monday–Saturday working week. */
export function startOfWeek(date: string): string {
  const weekday = toUtcNoon(date).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

export function getAgendaRange(view: AgendaView, date: string): AgendaRange {
  if (view === "day") return { from: date, to: date };
  if (view === "week") {
    const from = startOfWeek(date);
    return { from, to: addDays(from, 6) };
  }
  // Month grid: whole weeks covering the month; at most 6 weeks (42 days).
  const firstOfMonth = `${date.slice(0, 8)}01`;
  const lastOfMonth = addDays(addMonths(firstOfMonth, 1), -1);
  const from = startOfWeek(firstOfMonth);
  return { from, to: addDays(startOfWeek(lastOfMonth), 6) };
}

export function shiftAgendaDate(view: AgendaView, date: string, direction: 1 | -1): string {
  if (view === "day") return addDays(date, direction);
  if (view === "week") return addDays(date, 7 * direction);
  return addMonths(date, direction);
}

export function listDates({ from, to }: AgendaRange): string[] {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  return dates;
}

export function getTodayLocalDate(now: Date = new Date()): string {
  return getLocalDate(now.toISOString());
}

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: BUSINESS_HOURS_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatLocalTime(instant: string): string {
  return timeFormatter.format(new Date(instant));
}

const longDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const shortDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});
const monthFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});

export function formatLongDate(date: string): string {
  return longDateFormatter.format(toUtcNoon(date));
}

export function formatShortDate(date: string): string {
  return shortDateFormatter.format(toUtcNoon(date));
}

export function formatAgendaTitle(view: AgendaView, date: string): string {
  if (view === "day") return formatLongDate(date);
  if (view === "month") return monthFormatter.format(toUtcNoon(date));
  const { from, to } = getAgendaRange("week", date);
  return `${formatShortDate(from)} a ${formatShortDate(to)}`;
}

/** Converts a São Paulo wall-clock time into the UTC instant the API expects. */
export function localDateTimeToUtc(date: string, time: string): string {
  return getLocalTimeInstant(date, time, "earlier");
}

export const START_OPTION_STEP_MINUTES = 15;

/**
 * Suggested start times inside free windows: each window's first minute and
 * then every step aligned to the local clock, never after the latest start.
 */
export function listStartOptions(
  windows: readonly AvailabilityWindow[],
  stepMinutes = START_OPTION_STEP_MINUTES,
): string[] {
  const step = stepMinutes * 60_000;
  const options: string[] = [];
  for (const window of windows) {
    const first = Date.parse(window.startAt);
    const latest = Date.parse(window.latestStartAt);
    options.push(new Date(first).toISOString());
    // São Paulo offsets are whole hours today, so UTC alignment matches local alignment.
    for (let value = Math.floor(first / step) * step + step; value <= latest; value += step)
      options.push(new Date(value).toISOString());
  }
  return options;
}

/** wa.me link; Brazilian numbers without country code receive 55. */
export function getWhatsAppUrl(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const international = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${international}`;
}

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits;
}

const ruleMessages: Record<AppointmentRuleErrorCode, string> = {
  CONFLICT: "Esse horário já está ocupado. Escolha outro horário.",
  OUTSIDE_BUSINESS_HOURS: "O atendimento precisa começar e terminar dentro do expediente.",
  SERVICE_UNAVAILABLE: "Esse serviço está inativo ou exige avaliação prévia.",
  IDEMPOTENCY_CONFLICT:
    "Esse envio já foi registrado com outros dados. Abra o formulário novamente.",
  NOT_FOUND: "Registro não encontrado. Atualize a agenda.",
  INVALID_TIME_RANGE: "Confira a data e os horários informados.",
  INVALID_TRANSITION:
    "Essa ação não é permitida no estado atual do atendimento. Atualize a agenda.",
  NOT_STARTED:
    "O atendimento só pode ser concluído ou marcado como falta a partir do horário de início.",
};

export function getAgendaErrorMessage(body: unknown, fallback: string): string {
  if (typeof body !== "object" || body === null) return fallback;
  const { code, error } = body as { code?: unknown; error?: unknown };
  if (typeof code === "string" && Object.hasOwn(ruleMessages, code))
    return ruleMessages[code as AppointmentRuleErrorCode];
  return typeof error === "string" ? error : fallback;
}

export function groupByLocalDate<T extends { localDate: string }>(
  records: readonly T[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const record of records) {
    const group = groups.get(record.localDate);
    if (group) group.push(record);
    else groups.set(record.localDate, [record]);
  }
  return groups;
}
