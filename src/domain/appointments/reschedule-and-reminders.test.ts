import { describe, expect, it } from "vitest";

import {
  AppointmentRuleError,
  appointmentSchema,
  rescheduleInputSchema,
  type Appointment,
} from "./appointment";
import {
  completeAppointment,
  isReminderDue,
  markClientConfirmed,
  markReminderSent,
} from "./attendance";
import { rescheduleAppointment } from "./availability";

const service = {
  id: "cut",
  salonId: "salon",
  name: "Corte",
  durationMinutes: 60,
  startingPriceCents: 8000,
  hasVariablePrice: false,
  requiresEvaluation: false,
  isActive: true,
};
const base: Appointment = appointmentSchema.parse({
  id: "a1",
  salonId: "salon",
  professionalId: "primary",
  localDate: "2026-11-16",
  startAt: "2026-11-16T12:00:00.000Z",
  endAt: "2026-11-16T13:00:00.000Z",
  occupiedUntilAt: "2026-11-16T13:10:00.000Z",
  status: "confirmed",
  client: { name: "Ana", phone: "11999999999" },
  serviceSnapshot: {
    serviceId: "cut",
    name: "Corte",
    durationMinutes: 60,
    startingPriceCents: 7000,
    hasVariablePrice: false,
    requiresEvaluation: false,
  },
  appointmentIntervalMinutes: 10,
  source: "whatsapp",
  createdBy: "admin",
  updatedBy: "admin",
  createdAt: "2026-11-10T12:00:00.000Z",
  updatedAt: "2026-11-10T12:00:00.000Z",
});
const actor = { userId: "admin2", now: "2026-11-15T15:00:00.000Z" };
const empty = { appointments: [base], timeBlocks: [] };

function code(action: () => unknown) {
  try {
    action();
  } catch (error) {
    if (error instanceof AppointmentRuleError) return error.code;
    throw error;
  }
  return "ok";
}

describe("reschedule input", () => {
  it("accepts a minute-precision start and an optional service", () => {
    expect(rescheduleInputSchema.parse({ startAt: "2026-11-17T12:00:00Z" })).toEqual({
      startAt: "2026-11-17T12:00:00.000Z",
    });
    expect(rescheduleInputSchema.safeParse({ startAt: "2026-11-17T12:00:30Z" }).success).toBe(
      false,
    );
    expect(
      rescheduleInputSchema.safeParse({ startAt: "2026-11-17T12:00:00Z", status: "x" }).success,
    ).toBe(false);
  });
});

describe("rescheduleAppointment", () => {
  it("moves to another day keeping the snapshot, identity, client and history", () => {
    const moved = rescheduleAppointment(base, {
      ...empty,
      ...actor,
      startAt: "2026-11-17T17:00:00.000Z",
    });
    expect(moved).toMatchObject({
      id: "a1",
      localDate: "2026-11-17",
      startAt: "2026-11-17T17:00:00.000Z",
      endAt: "2026-11-17T18:00:00.000Z",
      occupiedUntilAt: "2026-11-17T18:10:00.000Z",
      serviceSnapshot: base.serviceSnapshot,
      client: base.client,
      createdAt: base.createdAt,
      updatedBy: "admin2",
    });
  });

  it("moves within the same day overlapping its own current period", () => {
    const moved = rescheduleAppointment(base, {
      ...empty,
      ...actor,
      startAt: "2026-11-16T12:30:00.000Z",
    });
    expect(moved?.startAt).toBe("2026-11-16T12:30:00.000Z");
  });

  it("changes the service with a new snapshot and recalculated duration", () => {
    const moved = rescheduleAppointment(base, {
      ...empty,
      ...actor,
      service: { ...service, id: "color", name: "Coloração", durationMinutes: 120 },
      startAt: base.startAt,
    });
    expect(moved).toMatchObject({
      endAt: "2026-11-16T14:00:00.000Z",
      occupiedUntilAt: "2026-11-16T14:10:00.000Z",
      serviceSnapshot: { serviceId: "color", name: "Coloração", durationMinutes: 120 },
    });
  });

  it("returns null when nothing changes", () => {
    expect(rescheduleAppointment(base, { ...empty, ...actor, startAt: base.startAt })).toBeNull();
  });

  it("rejects conflicts with others, outside hours and ineligible services", () => {
    const other = appointmentSchema.parse({
      ...base,
      id: "other",
      startAt: "2026-11-16T15:00:00.000Z",
      endAt: "2026-11-16T16:00:00.000Z",
      occupiedUntilAt: "2026-11-16T16:10:00.000Z",
    });
    const occupied = { appointments: [base, other], timeBlocks: [] };
    expect(
      code(() =>
        rescheduleAppointment(base, { ...occupied, ...actor, startAt: "2026-11-16T14:30:00Z" }),
      ),
    ).toBe("CONFLICT");
    // 22:00 UTC = 19:00 local: 60 min + 10 min do not fit before 20:00.
    expect(
      code(() =>
        rescheduleAppointment(base, { ...empty, ...actor, startAt: "2026-11-16T22:00:00Z" }),
      ),
    ).toBe("OUTSIDE_BUSINESS_HOURS");
    // Sunday is closed by default.
    expect(
      code(() =>
        rescheduleAppointment(base, { ...empty, ...actor, startAt: "2026-11-15T12:00:00Z" }),
      ),
    ).toBe("OUTSIDE_BUSINESS_HOURS");
    expect(
      code(() =>
        rescheduleAppointment(base, {
          ...empty,
          ...actor,
          service: { ...service, id: "eval", requiresEvaluation: true },
          startAt: base.startAt,
        }),
      ),
    ).toBe("SERVICE_REQUIRES_EVALUATION");
    expect(
      code(() =>
        rescheduleAppointment(base, {
          ...empty,
          ...actor,
          service: { ...service, id: "foreign", salonId: "other" },
          startAt: base.startAt,
        }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("only moves confirmed appointments", () => {
    const completed = completeAppointment(base, {
      userId: "admin",
      now: "2026-11-16T14:00:00.000Z",
    })!.appointment;
    expect(
      code(() =>
        rescheduleAppointment(completed, { ...empty, ...actor, startAt: "2026-11-17T12:00:00Z" }),
      ),
    ).toBe("INVALID_TRANSITION");
  });

  it("clears reminder and client confirmation only when the time changes", () => {
    const reminded = markClientConfirmed(
      markReminderSent(base, actor)!.appointment,
      actor,
    )!.appointment;
    const moved = rescheduleAppointment(reminded, {
      ...empty,
      ...actor,
      startAt: "2026-11-17T12:00:00.000Z",
    });
    expect(moved?.reminderSentAt).toBeUndefined();
    expect(moved?.clientConfirmedAt).toBeUndefined();
    const sameTime = rescheduleAppointment(reminded, {
      ...empty,
      ...actor,
      service: { ...service, id: "color", name: "Coloração" },
      startAt: base.startAt,
    });
    expect(sameTime?.reminderSentAt).toBe(actor.now);
    expect(sameTime?.clientConfirmedAt).toBe(actor.now);
  });
});

describe("reminders and client confirmation", () => {
  it("is due only within the 24 hours before a confirmed start", () => {
    expect(isReminderDue(base, "2026-11-15T11:59:00.000Z")).toBe(false);
    expect(isReminderDue(base, "2026-11-15T12:00:00.000Z")).toBe(true);
    expect(isReminderDue(base, "2026-11-16T11:59:00.000Z")).toBe(true);
    expect(isReminderDue(base, "2026-11-16T12:00:00.000Z")).toBe(false);
    const cancelled = appointmentSchema.parse({
      ...base,
      status: "cancelled",
      cancelledAt: actor.now,
    });
    expect(isReminderDue(cancelled, actor.now)).toBe(false);
  });

  it("registers a reminder once and keeps the first instant", () => {
    const first = markReminderSent(base, actor)!.appointment;
    expect(first.reminderSentAt).toBe(actor.now);
    expect(isReminderDue(first, actor.now)).toBe(false);
    expect(markReminderSent(first, { userId: "x", now: "2026-11-15T16:00:00.000Z" })).toBeNull();
  });

  it("registers client confirmation once, only for confirmed appointments", () => {
    const confirmed = markClientConfirmed(base, actor)!.appointment;
    expect(confirmed.clientConfirmedAt).toBe(actor.now);
    expect(markClientConfirmed(confirmed, actor)).toBeNull();
    const cancelled = appointmentSchema.parse({
      ...base,
      status: "cancelled",
      cancelledAt: actor.now,
    });
    expect(code(() => markClientConfirmed(cancelled, actor))).toBe("INVALID_TRANSITION");
    expect(code(() => markReminderSent(cancelled, actor))).toBe("INVALID_TRANSITION");
  });
});
