import { describe, expect, it } from "vitest";
import {
  appointmentSchema,
  availabilityQuerySchema,
  createAppointmentInputSchema,
  createTimeBlockInputSchema,
  dayQuerySchema,
  timeBlockSchema,
} from "./appointment";

const input = {
  requestId: "967c7de3-59cd-42a5-b42c-3ae843ce8aba",
  serviceId: "cut",
  startAt: "2026-11-11T12:00:00Z",
  client: { name: "  Ana  ", phone: "+55 (11) 99999-1234" },
  source: "manual",
};

describe("appointment inputs", () => {
  it("normalizes UTC, names and usual phone punctuation without inventing a country", () => {
    expect(createAppointmentInputSchema.parse(input)).toMatchObject({
      startAt: "2026-11-11T12:00:00.000Z",
      client: { name: "Ana", phone: "5511999991234" },
    });
    expect(
      createAppointmentInputSchema.parse({
        ...input,
        client: { name: "A", phone: "(11) 99999-1234" },
      }).client.phone,
    ).toBe("11999991234");
  });

  it.each([
    "2026-02-30T12:00:00Z",
    "2026-11-11T12:00:01Z",
    "2026-11-11T12:00:00.001Z",
    "2026-11-11T12:00:00.0001Z",
    "2026-11-11T09:00:00-03:00",
    "invalid",
  ])("rejects invalid or non-minute UTC %s", (startAt) => {
    expect(createAppointmentInputSchema.safeParse({ ...input, startAt }).success).toBe(false);
  });

  it.each(["123", "1234567890123456", "call11999991234", "11999991234#123"])(
    "rejects invalid phone %s",
    (phone) => {
      expect(
        createAppointmentInputSchema.safeParse({ ...input, client: { name: "Ana", phone } })
          .success,
      ).toBe(false);
    },
  );

  it("rejects injected administrative properties and invalid identifiers", () => {
    for (const patch of [
      { salonId: "other" },
      { professionalId: "other" },
      { status: "confirmed" },
      { requestId: "bad" },
      { serviceId: "a/b" },
      { serviceId: "a".repeat(129) },
      { serviceId: "" },
    ]) {
      expect(createAppointmentInputSchema.safeParse({ ...input, ...patch }).success).toBe(false);
    }
    expect(
      createAppointmentInputSchema.safeParse({ ...input, client: { ...input.client, id: "x" } })
        .success,
    ).toBe(false);
    expect(
      createAppointmentInputSchema.safeParse({ ...input, client: { ...input.client, name: " " } })
        .success,
    ).toBe(false);
    expect(
      createAppointmentInputSchema.safeParse({
        ...input,
        client: { ...input.client, name: "a".repeat(121) },
      }).success,
    ).toBe(false);
  });

  it("validates real calendar dates and strict query shapes", () => {
    expect(dayQuerySchema.parse({ date: "2024-02-29" })).toEqual({ date: "2024-02-29" });
    for (const date of ["2023-02-29", "2026-04-31", "2026-13-01", "2026-1-01", "invalid"]) {
      expect(dayQuerySchema.safeParse({ date }).success).toBe(false);
    }
    expect(dayQuerySchema.safeParse({ date: "2026-11-11", salonId: "x" }).success).toBe(false);
    expect(availabilityQuerySchema.parse({ date: "2026-11-11", serviceId: "cut" })).toEqual({
      date: "2026-11-11",
      serviceId: "cut",
    });
    expect(
      availabilityQuerySchema.safeParse({ date: "2026-11-11", serviceId: "a/b" }).success,
    ).toBe(false);
  });

  it("normalizes a block and rejects oversized reasons or extra fields", () => {
    const block = {
      requestId: input.requestId,
      startAt: input.startAt,
      endAt: "2026-11-11T13:00:00Z",
      reason: "  Pausa  ",
    };
    expect(createTimeBlockInputSchema.parse(block)).toMatchObject({
      reason: "Pausa",
      endAt: "2026-11-11T13:00:00.000Z",
    });
    expect(
      createTimeBlockInputSchema.safeParse({ ...block, reason: "x".repeat(201) }).success,
    ).toBe(false);
    expect(createTimeBlockInputSchema.safeParse({ ...block, salonId: "other" }).success).toBe(
      false,
    );
  });
});

describe("persisted records", () => {
  const common = {
    id: "record",
    salonId: "salon",
    professionalId: "primary",
    localDate: "2026-11-11",
    startAt: "2026-11-11T12:00:00.000Z",
    endAt: "2026-11-11T13:00:00.000Z",
    createdBy: "admin",
    updatedBy: "admin",
    createdAt: "2026-11-10T12:34:56.789Z",
    updatedAt: "2026-11-10T12:34:56.789Z",
  };
  const appointment = {
    ...common,
    occupiedUntilAt: "2026-11-11T13:10:00.000Z",
    status: "confirmed",
    client: { name: "Ana", phone: "11999991234" },
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
  };

  it("reads complete records and retains subminute audit precision", () => {
    expect(appointmentSchema.parse(appointment)).toEqual(appointment);
    expect(timeBlockSchema.parse({ ...common, status: "active" })).toEqual({
      ...common,
      status: "active",
    });
    expect(
      timeBlockSchema.parse({
        ...common,
        status: "cancelled",
        cancelledAt: "2026-11-11T10:01:02.003Z",
      }).cancelledAt,
    ).toBe("2026-11-11T10:01:02.003Z");
  });

  it("rejects malformed snapshots, identity, states, dates and timestamps", () => {
    for (const patch of [
      { id: "a/b" },
      { salonId: "" },
      { professionalId: "" },
      { status: "done" },
      { localDate: "2026-02-30" },
      { occupiedUntilAt: "bad" },
      { createdAt: "bad" },
      { appointmentIntervalMinutes: -1 },
      { serviceSnapshot: { ...appointment.serviceSnapshot, durationMinutes: 0 } },
    ]) {
      expect(appointmentSchema.safeParse({ ...appointment, ...patch }).success).toBe(false);
    }
    expect(timeBlockSchema.safeParse({ ...common, status: "confirmed" }).success).toBe(false);
  });

  it("rejects persisted ranges inconsistent with duration or cleanup snapshots", () => {
    expect(
      appointmentSchema.safeParse({ ...appointment, endAt: "2026-11-11T11:00:00.000Z" }).success,
    ).toBe(false);
    expect(
      appointmentSchema.safeParse({ ...appointment, occupiedUntilAt: "2026-11-11T12:59:00.000Z" })
        .success,
    ).toBe(false);
    expect(
      appointmentSchema.safeParse({
        ...appointment,
        serviceSnapshot: { ...appointment.serviceSnapshot, durationMinutes: 90 },
      }).success,
    ).toBe(false);
    expect(
      appointmentSchema.safeParse({ ...appointment, appointmentIntervalMinutes: 20 }).success,
    ).toBe(false);
    expect(
      timeBlockSchema.safeParse({ ...common, status: "active", endAt: common.startAt }).success,
    ).toBe(false);
  });
});
