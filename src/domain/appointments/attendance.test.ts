import { describe, expect, it } from "vitest";

import {
  AppointmentRuleError,
  appointmentSchema,
  completeAppointmentInputSchema,
  paymentSchema,
  type Appointment,
} from "./appointment";
import {
  assertCancellable,
  completeAppointment,
  getBalanceCents,
  getPaymentStatus,
  isReceivedRevenue,
  markNoShow,
  recordPayment,
  summarizeFinancials,
} from "./attendance";
import { calculateAvailability } from "./availability";

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
    startingPriceCents: 8000,
    hasVariablePrice: true,
    requiresEvaluation: false,
  },
  appointmentIntervalMinutes: 10,
  source: "whatsapp",
  createdBy: "admin",
  updatedBy: "admin",
  createdAt: "2026-11-10T12:00:00.000Z",
  updatedAt: "2026-11-10T12:00:00.000Z",
});
const atStart = { userId: "admin2", now: "2026-11-16T12:00:00.000Z" };
const later = { userId: "admin2", now: "2026-11-16T14:00:00.000Z" };
const paid = { finalPriceCents: 9500, paidCents: 9500, method: "pix" as const };

function code(action: () => unknown) {
  try {
    action();
  } catch (error) {
    if (error instanceof AppointmentRuleError) return error.code;
    throw error;
  }
  return "ok";
}

describe("payment input", () => {
  it("accepts unpaid, partial and full payments in integer cents", () => {
    expect(paymentSchema.parse({ finalPriceCents: 9500, paidCents: 0 })).toEqual({
      finalPriceCents: 9500,
      paidCents: 0,
    });
    expect(
      paymentSchema.parse({ finalPriceCents: 9500, paidCents: 5000, method: "cash" }),
    ).toMatchObject({ paidCents: 5000 });
    expect(paymentSchema.parse({ finalPriceCents: 0, paidCents: 0 }).finalPriceCents).toBe(0);
  });

  it.each([
    [{ finalPriceCents: 9500, paidCents: 9501, method: "pix" }, "overpaid"],
    [{ finalPriceCents: 9500, paidCents: 100 }, "paid without method"],
    [{ finalPriceCents: 95.5, paidCents: 0 }, "decimal money"],
    [{ finalPriceCents: -1, paidCents: 0 }, "negative"],
    [{ finalPriceCents: 10_000_001, paidCents: 0 }, "above limit"],
    [{ finalPriceCents: 100, paidCents: 100, method: "boleto" }, "unknown method"],
    [{ finalPriceCents: 100, paidCents: 0, salonId: "x" }, "forged field"],
  ])("rejects %j (%s)", (payment, reason) => {
    expect(paymentSchema.safeParse(payment).success, reason).toBe(false);
  });

  it("allows completing without payment and rejects unknown fields", () => {
    expect(completeAppointmentInputSchema.parse({})).toEqual({});
    expect(completeAppointmentInputSchema.safeParse({ status: "completed" }).success).toBe(false);
  });
});

describe("attendance transitions", () => {
  it("completes a confirmed appointment from its start, recording who and when", () => {
    const change = completeAppointment(base, atStart);
    expect(change?.appointment).toMatchObject({
      status: "completed",
      completedAt: atStart.now,
      updatedAt: atStart.now,
      updatedBy: "admin2",
      serviceSnapshot: base.serviceSnapshot,
    });
    expect(change?.appointment.payment).toBeUndefined();
    expect(change?.changed.sort()).toEqual(
      ["completedAt", "status", "updatedAt", "updatedBy"].sort(),
    );
  });

  it("completes and records payment together", () => {
    const change = completeAppointment(base, later, paid);
    expect(change?.appointment).toMatchObject({ payment: paid, paymentUpdatedAt: later.now });
    expect(change?.changed).toEqual(
      expect.arrayContaining(["payment", "paymentUpdatedAt", "status"]),
    );
  });

  it("refuses to finish an appointment one minute before it starts", () => {
    const early = { userId: "admin", now: "2026-11-16T11:59:00.000Z" };
    expect(code(() => completeAppointment(base, early))).toBe("NOT_STARTED");
    expect(code(() => markNoShow(base, early))).toBe("NOT_STARTED");
  });

  it("is idempotent for repeated completion and no-show", () => {
    const completed = completeAppointment(base, later)!.appointment;
    expect(completeAppointment(completed, later)).toBeNull();
    const noShow = markNoShow(base, later)!.appointment;
    expect(noShow).toMatchObject({ status: "no_show", noShowAt: later.now });
    expect(markNoShow(noShow, later)).toBeNull();
  });

  it("rejects transitions between finished and cancelled states", () => {
    const completed = completeAppointment(base, later)!.appointment;
    const noShow = markNoShow(base, later)!.appointment;
    const cancelled = appointmentSchema.parse({
      ...base,
      status: "cancelled",
      cancelledAt: later.now,
    });
    expect(code(() => markNoShow(completed, later))).toBe("INVALID_TRANSITION");
    expect(code(() => completeAppointment(noShow, later))).toBe("INVALID_TRANSITION");
    expect(code(() => completeAppointment(cancelled, later))).toBe("INVALID_TRANSITION");
    expect(code(() => markNoShow(cancelled, later))).toBe("INVALID_TRANSITION");
    expect(code(() => assertCancellable(completed))).toBe("INVALID_TRANSITION");
    expect(code(() => assertCancellable(noShow))).toBe("INVALID_TRANSITION");
    expect(code(() => assertCancellable(base))).toBe("ok");
  });

  it("records and corrects payments only on completed appointments", () => {
    expect(code(() => recordPayment(base, paid, later))).toBe("INVALID_TRANSITION");
    const completed = completeAppointment(base, later)!.appointment;
    const partial = recordPayment(
      completed,
      { finalPriceCents: 9500, paidCents: 4000, method: "debit" },
      later,
    ).appointment;
    expect(getPaymentStatus(partial)).toBe("partial");
    expect(getBalanceCents(partial.payment!)).toBe(5500);
    const settled = completeAppointment(partial, later, paid)!.appointment;
    expect(getPaymentStatus(settled)).toBe("paid");
  });

  it("derives the financial status independently from the operational one", () => {
    const completed = completeAppointment(base, later)!.appointment;
    expect(getPaymentStatus(base)).toBe("not_recorded");
    expect(getPaymentStatus(completed)).toBe("not_recorded");
    const unpaid = recordPayment(completed, { finalPriceCents: 100, paidCents: 0 }, later);
    expect(getPaymentStatus(unpaid.appointment)).toBe("unpaid");
    expect(isReceivedRevenue(unpaid.appointment)).toBe(false);
    const free = recordPayment(completed, { finalPriceCents: 0, paidCents: 0 }, later);
    expect(isReceivedRevenue(free.appointment)).toBe(true);
  });

  it("rejects inconsistent stored states", () => {
    expect(appointmentSchema.safeParse({ ...base, status: "completed" }).success).toBe(false);
    expect(
      appointmentSchema.safeParse({ ...base, payment: paid, paymentUpdatedAt: later.now }).success,
    ).toBe(false);
    expect(appointmentSchema.safeParse({ ...base, noShowAt: later.now }).success).toBe(false);
  });

  it("keeps completed and no-show periods occupied; only cancellation frees them", () => {
    const service = {
      id: "cut",
      salonId: "salon",
      name: "Corte",
      durationMinutes: 60,
      startingPriceCents: 8000,
      hasVariablePrice: true,
      requiresEvaluation: false,
      isActive: true,
    };
    const windowsWith = (appointment: Appointment) =>
      calculateAvailability({
        date: base.localDate,
        service,
        appointments: [appointment],
        timeBlocks: [],
      })[0].startAt;
    expect(windowsWith(completeAppointment(base, later)!.appointment)).toBe(base.occupiedUntilAt);
    expect(windowsWith(markNoShow(base, later)!.appointment)).toBe(base.occupiedUntilAt);
    expect(
      windowsWith(
        appointmentSchema.parse({ ...base, status: "cancelled", cancelledAt: later.now }),
      ),
    ).toBe(base.startAt);
  });
});

describe("financial summary", () => {
  const completed = completeAppointment(base, later)!.appointment;
  const record = (id: string, patch: Partial<Appointment>) =>
    appointmentSchema.parse({ ...completed, id, ...patch });

  it("counts only completed and fully paid appointments as received", () => {
    const summary = summarizeFinancials([
      record("paid-pix", { payment: paid, paymentUpdatedAt: later.now }),
      record("paid-cash", {
        payment: { finalPriceCents: 5000, paidCents: 5000, method: "cash" },
        paymentUpdatedAt: later.now,
        serviceSnapshot: { ...base.serviceSnapshot, serviceId: "color", name: "Coloração" },
      }),
      record("partial", {
        payment: { finalPriceCents: 9000, paidCents: 3000, method: "credit" },
        paymentUpdatedAt: later.now,
      }),
      record("unpaid", {
        payment: { finalPriceCents: 4000, paidCents: 0 },
        paymentUpdatedAt: later.now,
      }),
      record("no-record", {}),
      markNoShow(base, later)!.appointment,
      appointmentSchema.parse({ ...base, id: "c", status: "cancelled", cancelledAt: later.now }),
      base,
    ]);
    expect(summary).toMatchObject({
      receivedCents: 14_500,
      receivedCount: 2,
      openBalanceCents: 10_000,
      openCount: 2,
      withoutPaymentCount: 1,
      completedCount: 5,
      noShowCount: 1,
      cancelledCount: 1,
      byMethod: { pix: 9500, cash: 5000, debit: 0, credit: 0 },
    });
    expect(summary.byService).toEqual([
      { serviceId: "cut", name: "Corte", receivedCents: 9500, count: 1 },
      { serviceId: "color", name: "Coloração", receivedCents: 5000, count: 1 },
    ]);
  });

  it("returns zeros for an empty period", () => {
    expect(summarizeFinancials([])).toMatchObject({
      receivedCents: 0,
      openBalanceCents: 0,
      byService: [],
    });
  });
});
