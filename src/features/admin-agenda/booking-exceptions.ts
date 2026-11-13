import { localDateTimeToUtc } from "./agenda-calendar";

import type { AppointmentException } from "@/domain/appointments/appointment";
export type { AppointmentException };
export type OverridableErrorCode = "OUTSIDE_BUSINESS_HOURS" | "SERVICE_REQUIRES_EVALUATION";

const warningByCode: Record<OverridableErrorCode, string> = {
  OUTSIDE_BUSINESS_HOURS: "Este horário está fora do expediente.",
  SERVICE_REQUIRES_EVALUATION: "Este serviço exige avaliação prévia.",
};

export const exceptionLabels: Record<AppointmentException, string> = {
  outsideBusinessHours: "Fora do expediente",
  requiresEvaluation: "Avaliação",
};

export type OverridableError = { code: OverridableErrorCode; warning: string };

/**
 * Reads a failed response: only a 409 with `overridable: true` and a known code
 * can be confirmed by the professional. Anything else stays a plain error.
 */
export function parseOverridableError(status: number, body: unknown): OverridableError | undefined {
  if (status !== 409 || typeof body !== "object" || body === null) return undefined;
  const { code, overridable } = body as { code?: unknown; overridable?: unknown };
  if (overridable !== true || typeof code !== "string" || !Object.hasOwn(warningByCode, code))
    return undefined;
  const known = code as OverridableErrorCode;
  return { code: known, warning: warningByCode[known] };
}

/** Missing (old data) or unknown values are ignored. */
export function getAppointmentExceptions(appointment: {
  exceptions?: readonly string[];
}): AppointmentException[] {
  return (appointment.exceptions ?? []).filter((exception): exception is AppointmentException =>
    Object.hasOwn(exceptionLabels, exception),
  );
}

export type StartAtChoice = {
  date: string;
  startAt: string;
  useCustomTime: boolean;
  customTime: string;
};

/** The UTC start the API expects: the chosen free slot or a typed time on the same day. */
export function resolveStartAt(choice: StartAtChoice): { startAt: string } | { error: string } {
  if (!choice.useCustomTime) {
    return choice.startAt ? { startAt: choice.startAt } : { error: "Escolha o horário." };
  }
  if (!/^\d{2}:\d{2}$/.test(choice.customTime)) return { error: "Informe o horário de início." };
  try {
    return { startAt: localDateTimeToUtc(choice.date, choice.customTime) };
  } catch {
    return { error: "Confira a data e o horário informados." };
  }
}

/** An override resend carries its own request id, so the request fingerprint changes. */
export type PendingOverride<T> = {
  error: OverridableError;
  requestId: string;
  payload: T;
};

export function createPendingOverride<T>(
  error: OverridableError,
  payload: T,
  newId: () => string,
): PendingOverride<T> {
  return { error, payload, requestId: newId() };
}

const LOCAL_DATE_INPUT = /^\d{4}-\d{2}-\d{2}$/;

/** Whether a value has the `YYYY-MM-DD` shape produced by `<input type="date">`. */
export function isLocalDateInput(date: string): boolean {
  return LOCAL_DATE_INPUT.test(date);
}

/** Booking can proceed with either a listed free slot or a typed time on a valid date. */
export function canChooseStartTime(choice: {
  availabilityReady: boolean;
  useCustomTime: boolean;
  serviceId: string;
  date: string;
}): boolean {
  return choice.useCustomTime
    ? Boolean(choice.serviceId) && isLocalDateInput(choice.date)
    : choice.availabilityReady;
}
