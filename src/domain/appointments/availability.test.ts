import { describe, expect, it } from "vitest";
import {
  createDefaultBusinessHoursInput,
  type BusinessHours,
} from "../business-hours/business-hours";
import type { Service } from "../services/service";
import {
  type Appointment,
  type TimeBlock,
  type CreateAppointmentInput,
  type CreateTimeBlockInput,
  appointmentSchema,
  timeBlockSchema,
  AppointmentRuleError,
} from "./appointment";
import {
  buildAppointment,
  buildTimeBlock,
  calculateAvailability,
  intervalsOverlap,
} from "./availability";

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
const businessHours: BusinessHours = {
  ...createDefaultBusinessHoursInput(),
  salonId: "salon",
  professionalId: "primary",
  timezone: "America/Sao_Paulo",
};
const input: CreateAppointmentInput = {
  requestId: "967c7de3-59cd-42a5-b42c-3ae843ce8aba",
  serviceId: "cut",
  startAt: "2026-11-11T12:00:00.000Z",
  client: { name: "Ana", phone: "11999991234" },
  source: "manual",
};
const now = "2026-11-10T10:01:02.003Z";
const appointment: Appointment = {
  id: "appointment",
  salonId: "salon",
  professionalId: "primary",
  localDate: "2026-11-11",
  startAt: "2026-11-11T14:00:00.000Z",
  endAt: "2026-11-11T15:00:00.000Z",
  occupiedUntilAt: "2026-11-11T15:10:00.000Z",
  status: "confirmed",
  client: input.client,
  serviceSnapshot: {
    serviceId: "cut",
    name: "Corte",
    durationMinutes: 60,
    startingPriceCents: 2500,
    hasVariablePrice: false,
    requiresEvaluation: false,
  },
  appointmentIntervalMinutes: 10,
  source: "manual",
  exceptions: [],
  createdBy: "admin",
  updatedBy: "admin",
  createdAt: now,
  updatedAt: now,
};
const block: TimeBlock = {
  id: "block",
  salonId: "salon",
  professionalId: "primary",
  localDate: "2026-11-11",
  startAt: "2026-11-11T16:00:00.000Z",
  endAt: "2026-11-11T17:00:00.000Z",
  status: "active",
  createdBy: "admin",
  updatedBy: "admin",
  createdAt: now,
  updatedAt: now,
};
const context = {
  date: "2026-11-11",
  service,
  businessHours,
  appointments: [] as Appointment[],
  timeBlocks: [] as TimeBlock[],
};
const command = {
  id: "new",
  salonId: "salon",
  userId: "admin",
  input,
  service,
  businessHours,
  appointments: [] as Appointment[],
  timeBlocks: [] as TimeBlock[],
  now,
};
const blockInput: CreateTimeBlockInput = {
  requestId: input.requestId,
  startAt: "2026-11-11T03:00:00.000Z",
  endAt: "2026-11-12T03:00:00.000Z",
};
const blockCommand = {
  id: "new-block",
  salonId: "salon",
  userId: "admin",
  input: blockInput,
  appointments: [] as Appointment[],
  timeBlocks: [] as TimeBlock[],
  now,
};
function expectRule(fn: () => unknown, code: AppointmentRuleError["code"]) {
  expect(fn).toThrow(expect.objectContaining({ name: "AppointmentRuleError", code }));
}

describe("half-open intervals", () => {
  it.each([
    ["12:00", "13:00", "13:00", "14:00", false],
    ["12:00", "13:00", "12:59", "14:00", true],
    ["12:00", "14:00", "12:30", "13:00", true],
    ["12:00", "13:00", "11:00", "12:01", true],
    ["12:00", "13:00", "12:00", "13:00", true],
  ])("overlap %s-%s and %s-%s = %s", (a, b, c, d, expected) => {
    const instant = (time: string) => `2026-11-11T${time}:00.000Z`;
    expect(
      intervalsOverlap(
        { startAt: instant(a), endAt: instant(b) },
        { startAt: instant(c), endAt: instant(d) },
      ),
    ).toBe(expected);
  });

  it("rejects invalid or reversed intervals", () => {
    expectRule(
      () => intervalsOverlap({ startAt: "bad", endAt: input.startAt }, block),
      "INVALID_TIME_RANGE",
    );
    expectRule(
      () => intervalsOverlap({ startAt: block.endAt, endAt: block.startAt }, block),
      "INVALID_TIME_RANGE",
    );
  });
});

describe("availability", () => {
  it("rounds historical second offsets to bookable UTC minutes", () => {
    const windows = calculateAvailability({ ...context, date: "1900-01-01" });
    expect(windows).toEqual([
      {
        startAt: "1900-01-01T12:07:00.000Z",
        endAt: "1900-01-01T23:06:00.000Z",
        latestStartAt: "1900-01-01T21:56:00.000Z",
      },
    ]);
    for (const startAt of [windows[0].startAt, windows[0].latestStartAt]) {
      expect(buildAppointment({ ...command, input: { ...input, startAt } }).startAt).toBe(startAt);
    }
    expectRule(
      () =>
        buildAppointment({ ...command, input: { ...input, startAt: "1900-01-01T12:06:00.000Z" } }),
      "OUTSIDE_BUSINESS_HOURS",
    );
    expectRule(
      () =>
        buildAppointment({ ...command, input: { ...input, startAt: "1900-01-01T21:57:00.000Z" } }),
      "OUTSIDE_BUSINESS_HOURS",
    );
  });

  it("returns the full free window with the latest start including the configured interval", () => {
    expect(calculateAvailability(context)).toEqual([
      {
        startAt: "2026-11-11T12:00:00.000Z",
        endAt: "2026-11-11T23:00:00.000Z",
        latestStartAt: "2026-11-11T21:50:00.000Z",
      },
    ]);
    expect(calculateAvailability({ ...context, businessHours: null })).toEqual(
      calculateAvailability(context),
    );
  });

  it("honors a zero interval and changed service duration", () => {
    expect(
      calculateAvailability({
        ...context,
        businessHours: { ...businessHours, appointmentIntervalMinutes: 0 },
      })[0].latestStartAt,
    ).toBe("2026-11-11T22:00:00.000Z");
    expect(
      calculateAvailability({ ...context, service: { ...service, durationMinutes: 90 } })[0]
        .latestStartAt,
    ).toBe("2026-11-11T21:20:00.000Z");
  });

  it("subtracts reservations including their snapshot buffers and blocks, discarding too-short gaps", () => {
    expect(
      calculateAvailability({ ...context, appointments: [appointment], timeBlocks: [block] }),
    ).toEqual([
      {
        startAt: "2026-11-11T12:00:00.000Z",
        endAt: "2026-11-11T14:00:00.000Z",
        latestStartAt: "2026-11-11T12:50:00.000Z",
      },
      {
        startAt: "2026-11-11T17:00:00.000Z",
        endAt: "2026-11-11T23:00:00.000Z",
        latestStartAt: "2026-11-11T21:50:00.000Z",
      },
    ]);
  });

  it("merges overlapping occupancy and clips blocks at working-hour boundaries", () => {
    expect(
      calculateAvailability({
        ...context,
        timeBlocks: [
          { ...block, startAt: "2026-11-11T03:00:00.000Z", endAt: "2026-11-11T14:30:00.000Z" },
          { ...block, startAt: "2026-11-11T14:00:00.000Z", endAt: "2026-11-11T16:00:00.000Z" },
          { ...block, startAt: "2026-11-11T22:00:00.000Z", endAt: "2026-11-12T03:00:00.000Z" },
        ],
      }),
    ).toEqual([
      {
        startAt: "2026-11-11T16:00:00.000Z",
        endAt: "2026-11-11T22:00:00.000Z",
        latestStartAt: "2026-11-11T20:50:00.000Z",
      },
    ]);
  });

  it("ignores cancelled records and records from other salon, professional or date", () => {
    const appointments: Appointment[] = [
      { ...appointment, status: "cancelled" },
      { ...appointment, salonId: "other" },
      { ...appointment, professionalId: "other" },
      { ...appointment, localDate: "2026-11-12" },
    ];
    const timeBlocks: TimeBlock[] = [
      { ...block, status: "cancelled" },
      { ...block, salonId: "other" },
      { ...block, professionalId: "other" },
      { ...block, localDate: "2026-11-12" },
    ];
    expect(calculateAvailability({ ...context, appointments, timeBlocks })).toEqual(
      calculateAvailability(context),
    );
  });

  it("returns no windows on closed days, for oversized services, or huge allowed buffers", () => {
    expect(calculateAvailability({ ...context, date: "2026-11-15" })).toEqual([]);
    expect(
      calculateAvailability({ ...context, service: { ...service, durationMinutes: 1440 } }),
    ).toEqual([]);
    expect(
      calculateAvailability({
        ...context,
        businessHours: { ...businessHours, appointmentIntervalMinutes: Number.MAX_SAFE_INTEGER },
      }),
    ).toEqual([]);
  });

  it("rejects unavailable services, incorrect configuration scope, and nonexistent local working times", () => {
    expectRule(
      () => calculateAvailability({ ...context, service: { ...service, isActive: false } }),
      "SERVICE_UNAVAILABLE",
    );
    expectRule(
      () =>
        calculateAvailability({ ...context, service: { ...service, requiresEvaluation: true } }),
      "SERVICE_UNAVAILABLE",
    );
    expectRule(
      () =>
        calculateAvailability({
          ...context,
          businessHours: { ...businessHours, salonId: "other" },
        }),
      "NOT_FOUND",
    );
    expectRule(
      () =>
        calculateAvailability({
          ...context,
          date: "2018-11-04",
          businessHours: {
            ...businessHours,
            weeklyHours: {
              ...businessHours.weeklyHours,
              sunday: { isOpen: true, startLocalTime: "00:30", endLocalTime: "20:00" },
            },
          },
        }),
      "INVALID_TIME_RANGE",
    );
  });
});

describe("appointment builder", () => {
  it("creates a coherent independent service and client snapshot using injected audit time", () => {
    const mutableService = { ...service };
    const mutableInput = { ...input, client: { ...input.client } };
    const result = buildAppointment({ ...command, service: mutableService, input: mutableInput });
    expect(result).toEqual({
      ...appointment,
      id: "new",
      startAt: "2026-11-11T12:00:00.000Z",
      endAt: "2026-11-11T13:00:00.000Z",
      occupiedUntilAt: "2026-11-11T13:10:00.000Z",
    });
    mutableService.durationMinutes = 90;
    mutableService.name = "Changed";
    mutableInput.client.name = "Changed";
    expect(result.serviceSnapshot.name).toBe("Corte");
    expect(result.serviceSnapshot.durationMinutes).toBe(60);
    expect(result.client.name).toBe("Ana");
    expect(appointmentSchema.safeParse(result).success).toBe(true);
  });

  it("accepts exact closing fit, zero buffer, default configuration and historical dates", () => {
    expect(
      buildAppointment({ ...command, input: { ...input, startAt: "2026-11-11T21:50:00.000Z" } })
        .occupiedUntilAt,
    ).toBe("2026-11-11T23:00:00.000Z");
    expect(
      buildAppointment({
        ...command,
        businessHours: { ...businessHours, appointmentIntervalMinutes: 0 },
        input: { ...input, startAt: "2026-11-11T22:00:00.000Z" },
      }).occupiedUntilAt,
    ).toBe("2026-11-11T23:00:00.000Z");
    expect(buildAppointment({ ...command, businessHours: null }).appointmentIntervalMinutes).toBe(
      10,
    );
    expect(
      buildAppointment({ ...command, input: { ...input, startAt: "2019-02-16T11:00:00.000Z" } })
        .localDate,
    ).toBe("2019-02-16");
  });

  it.each(["2026-11-11T11:59:00.000Z", "2026-11-11T21:51:00.000Z", "2026-11-15T12:00:00.000Z"])(
    "rejects occupancy outside hours: %s",
    (startAt) => {
      expectRule(
        () => buildAppointment({ ...command, input: { ...input, startAt } }),
        "OUTSIDE_BUSINESS_HOURS",
      );
    },
  );

  it("rejects oversized buffers before attempting invalid Date arithmetic", () => {
    expectRule(
      () =>
        buildAppointment({
          ...command,
          businessHours: { ...businessHours, appointmentIntervalMinutes: Number.MAX_SAFE_INTEGER },
        }),
      "OUTSIDE_BUSINESS_HOURS",
    );
  });

  it.each(["2026-11-11T13:00:00.000Z", "2026-11-11T14:30:00.000Z", "2026-11-11T15:09:00.000Z"])(
    "rejects overlap including only cleanup: %s",
    (startAt) => {
      expectRule(
        () =>
          buildAppointment({
            ...command,
            input: { ...input, startAt },
            appointments: [appointment],
          }),
        "CONFLICT",
      );
    },
  );

  it("permits exact adjacency in both directions and releases cancelled occupation", () => {
    expect(
      buildAppointment({
        ...command,
        input: { ...input, startAt: "2026-11-11T12:50:00.000Z" },
        appointments: [appointment],
      }).occupiedUntilAt,
    ).toBe(appointment.startAt);
    expect(
      buildAppointment({
        ...command,
        input: { ...input, startAt: appointment.occupiedUntilAt },
        appointments: [appointment],
      }).startAt,
    ).toBe(appointment.occupiedUntilAt);
    expect(
      buildAppointment({
        ...command,
        input: { ...input, startAt: appointment.startAt },
        appointments: [{ ...appointment, status: "cancelled" }],
      }).status,
    ).toBe("confirmed");
  });

  it("rejects blocks, wrong service identity and unavailable services", () => {
    expectRule(
      () =>
        buildAppointment({
          ...command,
          input: { ...input, startAt: block.startAt },
          timeBlocks: [block],
        }),
      "CONFLICT",
    );
    expectRule(
      () => buildAppointment({ ...command, service: { ...service, salonId: "other" } }),
      "NOT_FOUND",
    );
    expectRule(
      () => buildAppointment({ ...command, input: { ...input, serviceId: "other" } }),
      "NOT_FOUND",
    );
    expectRule(
      () => buildAppointment({ ...command, service: { ...service, requiresEvaluation: true } }),
      "SERVICE_REQUIRES_EVALUATION",
    );
    expectRule(
      () => buildAppointment({ ...command, service: { ...service, isActive: false } }),
      "SERVICE_INACTIVE",
    );
  });
});

describe("time block builder", () => {
  it("allows a full local day ending at next midnight without buffer", () => {
    const result = buildTimeBlock(blockCommand);
    expect(result).toEqual({
      ...block,
      id: "new-block",
      startAt: "2026-11-11T03:00:00.000Z",
      endAt: "2026-11-12T03:00:00.000Z",
    });
    expect(timeBlockSchema.safeParse(result).success).toBe(true);
    expect(
      buildTimeBlock({
        ...blockCommand,
        input: {
          ...blockInput,
          startAt: "2018-11-04T03:00:00.000Z",
          endAt: "2018-11-05T02:00:00.000Z",
          reason: " Pausa ",
        },
      }),
    ).toMatchObject({ localDate: "2018-11-04", reason: "Pausa" });
  });

  it.each([
    ["2026-11-11T12:00:00.000Z", "2026-11-11T12:00:00.000Z"],
    ["2026-11-11T13:00:00.000Z", "2026-11-11T12:00:00.000Z"],
    ["2026-11-11T03:00:00.000Z", "2026-11-12T03:01:00.000Z"],
  ])("rejects invalid day range %s to %s", (startAt, endAt) => {
    expectRule(
      () => buildTimeBlock({ ...blockCommand, input: { ...blockInput, startAt, endAt } }),
      "INVALID_TIME_RANGE",
    );
  });

  it("rejects active appointments and blocks, but accepts adjacent or cancelled ones", () => {
    expectRule(() => buildTimeBlock({ ...blockCommand, appointments: [appointment] }), "CONFLICT");
    expectRule(() => buildTimeBlock({ ...blockCommand, timeBlocks: [block] }), "CONFLICT");
    expect(
      buildTimeBlock({
        ...blockCommand,
        appointments: [{ ...appointment, status: "cancelled" }],
        timeBlocks: [{ ...block, status: "cancelled" }],
      }).status,
    ).toBe("active");
    expect(
      buildTimeBlock({
        ...blockCommand,
        input: { ...blockInput, startAt: appointment.occupiedUntilAt, endAt: block.startAt },
        appointments: [appointment],
        timeBlocks: [block],
      }).endAt,
    ).toBe(block.startAt);
  });

  it("ignores occupation from another salon or professional", () => {
    expect(
      buildTimeBlock({
        ...blockCommand,
        appointments: [{ ...appointment, salonId: "other" }],
        timeBlocks: [{ ...block, professionalId: "other" }],
      }).status,
    ).toBe("active");
  });
});
