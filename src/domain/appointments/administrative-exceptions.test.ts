import { describe, expect, it } from "vitest";

import {
  createDefaultBusinessHoursInput,
  type BusinessHours,
} from "../business-hours/business-hours";
import type { Service } from "../services/service";
import {
  AppointmentRuleError,
  appointmentSchema,
  type Appointment,
  type CreateAppointmentInput,
  type TimeBlock,
} from "./appointment";
import { buildAppointment, rescheduleAppointment } from "./availability";

const service: Service = {
  id: "cut",
  salonId: "salon",
  name: "Corte",
  durationMinutes: 60,
  startingPriceCents: 2500,
  isActive: true,
  hasVariablePrice: false,
  requiresEvaluation: false,
};
const evaluation: Service = { ...service, id: "color", requiresEvaluation: true };
const businessHours: BusinessHours = {
  ...createDefaultBusinessHoursInput(),
  salonId: "salon",
  professionalId: "primary",
  timezone: "America/Sao_Paulo",
};
const now = "2026-11-10T10:01:02.003Z";
const inside = "2026-11-11T12:00:00.000Z"; // 09:00 local, Wednesday
const early = "2026-11-11T09:00:00.000Z"; // 06:00 local, before opening
const sunday = "2026-11-15T15:00:00.000Z"; // closed day
const lateNight = "2026-11-12T02:30:00.000Z"; // 23:30 local, crosses midnight

function input(overrides: Partial<CreateAppointmentInput> = {}): CreateAppointmentInput {
  return {
    requestId: "967c7de3-59cd-42a5-b42c-3ae843ce8aba",
    serviceId: "cut",
    startAt: inside,
    client: { name: "Ana", phone: "11999991234" },
    source: "manual",
    ...overrides,
  };
}
function build(
  overrides: Partial<CreateAppointmentInput>,
  options: { service?: Service; appointments?: Appointment[]; timeBlocks?: TimeBlock[] } = {},
) {
  const chosen = options.service ?? service;
  return buildAppointment({
    id: "new",
    salonId: "salon",
    userId: "admin",
    input: input({ serviceId: chosen.id, ...overrides }),
    service: chosen,
    businessHours,
    appointments: options.appointments ?? [],
    timeBlocks: options.timeBlocks ?? [],
    now,
  });
}
function codeOf(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    if (error instanceof AppointmentRuleError) return error.code;
    throw error;
  }
  return undefined;
}
const existing = (startAt: string, endAt: string, occupiedUntilAt: string): Appointment =>
  appointmentSchema.parse({
    ...build({}),
    id: "existing",
    localDate: "2026-11-11",
    startAt,
    endAt,
    occupiedUntilAt,
  });

describe("administrative exceptions on create", () => {
  it("keeps the restrictions and distinguishable codes without allowExceptions", () => {
    expect(codeOf(() => build({ startAt: early }))).toBe("OUTSIDE_BUSINESS_HOURS");
    expect(codeOf(() => build({ startAt: early, allowExceptions: false }))).toBe(
      "OUTSIDE_BUSINESS_HOURS",
    );
    expect(codeOf(() => build({}, { service: evaluation }))).toBe("SERVICE_REQUIRES_EVALUATION");
    expect(codeOf(() => build({}, { service: { ...service, isActive: false } }))).toBe(
      "SERVICE_INACTIVE",
    );
  });

  it("records no exceptions for a normal appointment", () => {
    expect(build({}).exceptions).toEqual([]);
    expect(build({ allowExceptions: true }).exceptions).toEqual([]);
  });

  it("accepts a start outside business hours and records only that exception", () => {
    const result = build({ startAt: early, allowExceptions: true });
    expect(result.exceptions).toEqual(["outsideBusinessHours"]);
    expect(result.status).toBe("confirmed");
    expect(build({ startAt: sunday, allowExceptions: true }).exceptions).toEqual([
      "outsideBusinessHours",
    ]);
  });

  it("accepts an evaluation service and keeps the manual confirmed status", () => {
    const result = build({ allowExceptions: true }, { service: evaluation });
    expect(result.exceptions).toEqual(["requiresEvaluation"]);
    expect(result.status).toBe("confirmed");
    expect(result.serviceSnapshot.requiresEvaluation).toBe(true);
  });

  it("records both exceptions when both are used", () => {
    expect(
      build({ startAt: early, allowExceptions: true }, { service: evaluation }).exceptions,
    ).toEqual(["requiresEvaluation", "outsideBusinessHours"]);
  });

  it("never allows an inactive service", () => {
    expect(
      codeOf(() => build({ allowExceptions: true }, { service: { ...service, isActive: false } })),
    ).toBe("SERVICE_INACTIVE");
  });

  it("still rejects conflicts, including the interval, with exceptions", () => {
    const other = existing(early, "2026-11-11T10:00:00.000Z", "2026-11-11T10:10:00.000Z");
    expect(
      codeOf(() => build({ startAt: early, allowExceptions: true }, { appointments: [other] })),
    ).toBe("CONFLICT");
    // Starts when the other ends but before its 10 minute interval is over.
    expect(
      codeOf(() =>
        build(
          { startAt: "2026-11-11T10:00:00.000Z", allowExceptions: true },
          { appointments: [other] },
        ),
      ),
    ).toBe("CONFLICT");
    expect(
      build(
        { startAt: "2026-11-11T10:10:00.000Z", allowExceptions: true },
        { appointments: [other] },
      ).exceptions,
    ).toEqual(["outsideBusinessHours"]);
  });

  it("still rejects overlap with a time block with exceptions", () => {
    const block: TimeBlock = {
      id: "block",
      salonId: "salon",
      professionalId: "primary",
      localDate: "2026-11-11",
      startAt: early,
      endAt: "2026-11-11T10:00:00.000Z",
      status: "active",
      createdBy: "admin",
      updatedBy: "admin",
      createdAt: now,
      updatedAt: now,
    };
    expect(
      codeOf(() => build({ startAt: early, allowExceptions: true }, { timeBlocks: [block] })),
    ).toBe("CONFLICT");
  });

  it("rejects an appointment that does not end on the same local day", () => {
    expect(codeOf(() => build({ startAt: lateNight, allowExceptions: true }))).toBe(
      "INVALID_TIME_RANGE",
    );
  });

  it("rejects a non-boolean allowExceptions", () => {
    expect(() => build({ allowExceptions: "true" as unknown as boolean })).toThrow();
  });
});

describe("administrative exceptions on reschedule", () => {
  const base = build({});
  const command = {
    appointments: [base],
    timeBlocks: [],
    businessHours,
    userId: "admin2",
    now: "2026-11-11T08:00:00.000Z",
  };

  it("moves outside business hours only with allowExceptions", () => {
    expect(codeOf(() => rescheduleAppointment(base, { ...command, startAt: early }))).toBe(
      "OUTSIDE_BUSINESS_HOURS",
    );
    const moved = rescheduleAppointment(base, {
      ...command,
      startAt: early,
      allowExceptions: true,
    });
    expect(moved?.exceptions).toEqual(["outsideBusinessHours"]);
  });

  it("changes to an evaluation service only with allowExceptions", () => {
    const change = { ...command, service: evaluation, startAt: inside };
    expect(codeOf(() => rescheduleAppointment(base, change))).toBe("SERVICE_REQUIRES_EVALUATION");
    expect(rescheduleAppointment(base, { ...change, allowExceptions: true })?.exceptions).toEqual([
      "requiresEvaluation",
    ]);
  });

  it("clears exceptions when the new plan no longer needs them", () => {
    const outside = build({ startAt: early, allowExceptions: true });
    const back = rescheduleAppointment(outside, {
      ...command,
      appointments: [outside],
      startAt: inside,
    });
    expect(back?.exceptions).toEqual([]);
  });

  it("is a no-op when time and exceptions are unchanged", () => {
    const outside = build({ startAt: early, allowExceptions: true });
    expect(
      rescheduleAppointment(outside, {
        ...command,
        appointments: [outside],
        startAt: early,
        allowExceptions: true,
      }),
    ).toBeNull();
  });

  it("keeps rejecting conflicts and inactive services with exceptions", () => {
    const other = existing(early, "2026-11-11T10:00:00.000Z", "2026-11-11T10:10:00.000Z");
    expect(
      codeOf(() =>
        rescheduleAppointment(base, {
          ...command,
          appointments: [base, other],
          startAt: early,
          allowExceptions: true,
        }),
      ),
    ).toBe("CONFLICT");
    expect(
      codeOf(() =>
        rescheduleAppointment(base, {
          ...command,
          service: { ...service, id: "off", isActive: false },
          startAt: inside,
          allowExceptions: true,
        }),
      ),
    ).toBe("SERVICE_INACTIVE");
  });
});

describe("appointment schema", () => {
  it("reads legacy documents without exceptions as an empty list", () => {
    const legacy: Record<string, unknown> = { ...build({}) };
    delete legacy.exceptions;
    expect(appointmentSchema.parse(legacy).exceptions).toEqual([]);
  });

  it("rejects unknown exception values", () => {
    expect(() => appointmentSchema.parse({ ...build({}), exceptions: ["other"] })).toThrow();
  });
});
