import {
  BUSINESS_HOURS_TIME_ZONE,
  DEFAULT_PROFESSIONAL_ID,
  businessHoursSchema,
  createDefaultBusinessHoursInput,
  type BusinessHours,
} from "../business-hours/business-hours";
import { createServiceSchema, type Service } from "../services/service";
import {
  AppointmentRuleError,
  appointmentSchema,
  createAppointmentInputSchema,
  createTimeBlockInputSchema,
  localDateSchema,
  timeBlockSchema,
  utcMinuteSchema,
  type Appointment,
  type CreateAppointmentInput,
  type CreateTimeBlockInput,
  type TimeBlock,
} from "./appointment";
import { getLocalDate, getLocalDayBounds, getLocalTimeInstant } from "./local-date";

export type AvailabilityWindow = { startAt: string; endAt: string; latestStartAt: string };
type Interval = { startAt: string; endAt: string };
type Occupation = { appointments: readonly Appointment[]; timeBlocks: readonly TimeBlock[] };
type ServiceContext = { service: Service; businessHours?: BusinessHours | null };
type AvailabilityInput = ServiceContext & Occupation & { date: string };
type CommandContext = Occupation & { id: string; salonId: string; userId: string; now: string };

function milliseconds(interval: Interval): { start: number; end: number } {
  const start = utcMinuteSchema.safeParse(interval.startAt);
  const end = utcMinuteSchema.safeParse(interval.endAt);
  if (!start.success || !end.success || Date.parse(start.data) >= Date.parse(end.data)) {
    throw new AppointmentRuleError(
      "INVALID_TIME_RANGE",
      "O início deve ser anterior ao fim, com precisão de minuto.",
    );
  }
  return { start: Date.parse(start.data), end: Date.parse(end.data) };
}

export function intervalsOverlap(a: Interval, b: Interval): boolean {
  const first = milliseconds(a);
  const second = milliseconds(b);
  return first.start < second.end && second.start < first.end;
}

function resolveHours({ service, businessHours }: ServiceContext): BusinessHours {
  if (
    businessHours &&
    (businessHours.salonId !== service.salonId ||
      businessHours.professionalId !== DEFAULT_PROFESSIONAL_ID)
  ) {
    throw new AppointmentRuleError("NOT_FOUND", "Configuração não encontrada.");
  }
  createServiceSchema.parse({
    name: service.name,
    durationMinutes: service.durationMinutes,
    startingPriceCents: service.startingPriceCents,
    hasVariablePrice: service.hasVariablePrice,
    requiresEvaluation: service.requiresEvaluation,
    isActive: service.isActive,
  });
  if (!service.isActive || service.requiresEvaluation) {
    throw new AppointmentRuleError(
      "SERVICE_UNAVAILABLE",
      "O serviço não está disponível para confirmação.",
    );
  }
  return businessHoursSchema.parse(
    businessHours ?? {
      ...createDefaultBusinessHoursInput(),
      salonId: service.salonId,
      professionalId: DEFAULT_PROFESSIONAL_ID,
      timezone: BUSINESS_HOURS_TIME_ZONE,
    },
  );
}

function workingInterval(date: string, hours: BusinessHours): Interval | null {
  localDateSchema.parse(date);
  const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  const days = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ] as const;
  const day = hours.weeklyHours[days[weekday]];
  if (!day.isOpen) return null;
  const opening = Date.parse(getLocalTimeInstant(date, day.startLocalTime, "earlier"));
  const closing = Date.parse(getLocalTimeInstant(date, day.endLocalTime, "later"));
  // Historical offsets may include seconds. Keep only whole UTC minutes
  // contained in the real working period so every returned start is bookable.
  return {
    startAt: new Date(Math.ceil(opening / 60_000) * 60_000).toISOString(),
    endAt: new Date(Math.floor(closing / 60_000) * 60_000).toISOString(),
  };
}

function occupiedIntervals(
  salonId: string,
  date: string,
  { appointments, timeBlocks }: Occupation,
): Interval[] {
  const sameScope = (record: Appointment | TimeBlock) =>
    record.salonId === salonId &&
    record.professionalId === DEFAULT_PROFESSIONAL_ID &&
    record.localDate === date;
  return [
    ...appointments
      .filter((appointment) => sameScope(appointment) && appointment.status === "confirmed")
      .map((appointment) => ({ startAt: appointment.startAt, endAt: appointment.occupiedUntilAt })),
    ...timeBlocks
      .filter((block) => sameScope(block) && block.status === "active")
      .map((block) => ({ startAt: block.startAt, endAt: block.endAt })),
  ];
}

export function calculateAvailability(input: AvailabilityInput): AvailabilityWindow[] {
  const hours = resolveHours(input);
  const working = workingInterval(input.date, hours);
  if (!working) return [];
  const start = Date.parse(working.startAt);
  const end = Date.parse(working.endAt);
  const durationMinutes = input.service.durationMinutes + hours.appointmentIntervalMinutes;
  // Compare minutes before multiplying: the configuration permits large safe integers.
  if (durationMinutes > (end - start) / 60_000) return [];
  const duration = durationMinutes * 60_000;
  const occupied = occupiedIntervals(input.service.salonId, input.date, input)
    .map(milliseconds)
    .sort((a, b) => a.start - b.start);
  const windows: AvailabilityWindow[] = [];
  const append = (from: number, until: number) => {
    if (until - from >= duration)
      windows.push({
        startAt: new Date(from).toISOString(),
        endAt: new Date(until).toISOString(),
        latestStartAt: new Date(until - duration).toISOString(),
      });
  };
  let cursor = start;
  for (const interval of occupied) {
    if (interval.end <= cursor) continue;
    if (interval.start >= end) break;
    append(cursor, Math.min(end, interval.start));
    cursor = Math.max(cursor, interval.end);
    if (cursor >= end) break;
  }
  append(cursor, end);
  return windows;
}

function assertNoConflict(
  interval: Interval,
  salonId: string,
  date: string,
  occupation: Occupation,
): void {
  if (
    occupiedIntervals(salonId, date, occupation).some((other) => intervalsOverlap(interval, other))
  ) {
    throw new AppointmentRuleError("CONFLICT", "O período já está ocupado.");
  }
}

export function buildAppointment(
  command: CommandContext & ServiceContext & { input: CreateAppointmentInput },
): Appointment {
  const input = createAppointmentInputSchema.parse(command.input);
  if (command.service.salonId !== command.salonId || command.service.id !== input.serviceId) {
    throw new AppointmentRuleError("NOT_FOUND", "Serviço não encontrado.");
  }
  const hours = resolveHours(command);
  const date = getLocalDate(input.startAt);
  const working = workingInterval(date, hours);
  const start = Date.parse(input.startAt);
  const duration = command.service.durationMinutes + hours.appointmentIntervalMinutes;
  if (
    !working ||
    start < Date.parse(working.startAt) ||
    duration > (Date.parse(working.endAt) - start) / 60_000
  ) {
    throw new AppointmentRuleError(
      "OUTSIDE_BUSINESS_HOURS",
      "Toda a duração e o intervalo devem caber no expediente.",
    );
  }
  const endAt = new Date(start + command.service.durationMinutes * 60_000).toISOString();
  const occupiedUntilAt = new Date(start + duration * 60_000).toISOString();
  assertNoConflict(
    { startAt: input.startAt, endAt: occupiedUntilAt },
    command.salonId,
    date,
    command,
  );
  const service = command.service;
  return appointmentSchema.parse({
    id: command.id,
    salonId: command.salonId,
    professionalId: DEFAULT_PROFESSIONAL_ID,
    localDate: date,
    startAt: input.startAt,
    endAt,
    occupiedUntilAt,
    status: "confirmed",
    client: input.client,
    serviceSnapshot: {
      serviceId: service.id,
      name: service.name,
      durationMinutes: service.durationMinutes,
      startingPriceCents: service.startingPriceCents,
      hasVariablePrice: service.hasVariablePrice,
      requiresEvaluation: service.requiresEvaluation,
    },
    appointmentIntervalMinutes: hours.appointmentIntervalMinutes,
    source: input.source,
    createdBy: command.userId,
    updatedBy: command.userId,
    createdAt: command.now,
    updatedAt: command.now,
  });
}

export function buildTimeBlock(
  command: CommandContext & { input: CreateTimeBlockInput },
): TimeBlock {
  const input = createTimeBlockInputSchema.parse(command.input);
  const interval = milliseconds(input);
  const date = getLocalDate(input.startAt);
  if (interval.end > Date.parse(getLocalDayBounds(date).endAt)) {
    throw new AppointmentRuleError(
      "INVALID_TIME_RANGE",
      "O bloqueio deve caber em um único dia local.",
    );
  }
  assertNoConflict(input, command.salonId, date, command);
  return timeBlockSchema.parse({
    id: command.id,
    salonId: command.salonId,
    professionalId: DEFAULT_PROFESSIONAL_ID,
    localDate: date,
    startAt: input.startAt,
    endAt: input.endAt,
    status: "active",
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    createdBy: command.userId,
    updatedBy: command.userId,
    createdAt: command.now,
    updatedAt: command.now,
  });
}
