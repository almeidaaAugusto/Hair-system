import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { appointmentSchema, type Appointment } from "@/domain/appointments/appointment";

import {
  buildPaymentInput,
  describePayment,
  getDefaultPaymentFields,
  isAppointmentStarted,
} from "./agenda-finance";
import { FinancialSummaryPanel } from "./financial-summary";

const confirmed: Appointment = appointmentSchema.parse({
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
    startingPriceCents: 123456,
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
const completed = (payment?: Appointment["payment"]): Appointment =>
  appointmentSchema.parse({
    ...confirmed,
    status: "completed",
    completedAt: "2026-11-16T14:00:00.000Z",
    ...(payment ? { payment, paymentUpdatedAt: "2026-11-16T14:00:00.000Z" } : {}),
  });

describe("payment form conversion", () => {
  it("defaults to the snapshot starting price, fully paid", () => {
    expect(getDefaultPaymentFields(confirmed)).toEqual({
      finalPrice: "1.234,56",
      paidPrice: "1.234,56",
      method: "",
    });
    expect(
      getDefaultPaymentFields(
        completed({ finalPriceCents: 9000, paidCents: 3000, method: "cash" }),
      ),
    ).toEqual({ finalPrice: "90,00", paidPrice: "30,00", method: "cash" });
  });

  it("builds payments in integer cents", () => {
    expect(buildPaymentInput({ finalPrice: "1.234,56", paidPrice: "100", method: "pix" })).toEqual({
      finalPriceCents: 123456,
      paidCents: 10000,
      method: "pix",
    });
    expect(buildPaymentInput({ finalPrice: "90,00", paidPrice: "", method: "" })).toEqual({
      finalPriceCents: 9000,
      paidCents: 0,
    });
  });

  it.each([
    [{ finalPrice: "abc", paidPrice: "0", method: "" }, /valores/],
    [{ finalPrice: "90,00", paidPrice: "90,01", method: "pix" }, /maior que o valor final/],
    [{ finalPrice: "90,00", paidPrice: "10,00", method: "" }, /forma de pagamento/],
    [{ finalPrice: "100.000,01", paidPrice: "0", method: "" }, /valores/],
  ] as const)("returns a message for %j", (fields, message) => {
    expect(buildPaymentInput(fields)).toMatch(message);
  });
});

describe("payment description", () => {
  it("describes each financial state of completed appointments only", () => {
    expect(describePayment(confirmed)).toBeUndefined();
    expect(describePayment(completed())).toBe("Pagamento não registrado");
    expect(
      describePayment(completed({ finalPriceCents: 9000, paidCents: 9000, method: "pix" })),
    ).toBe("Pago R$ 90,00 · Pix");
    expect(
      describePayment(completed({ finalPriceCents: 9000, paidCents: 3000, method: "debit" })),
    ).toBe("Parcial: em aberto R$ 60,00");
    expect(describePayment(completed({ finalPriceCents: 9000, paidCents: 0 }))).toBe(
      "Não pago: em aberto R$ 90,00",
    );
  });

  it("only allows finishing from the start time", () => {
    expect(isAppointmentStarted(confirmed, new Date("2026-11-16T11:59:59Z"))).toBe(false);
    expect(isAppointmentStarted(confirmed, new Date("2026-11-16T12:00:00Z"))).toBe(true);
  });
});

describe("financial summary panel", () => {
  it("shows received, open values and breakdowns", () => {
    const html = renderToStaticMarkup(
      createElement(FinancialSummaryPanel, {
        appointments: [
          completed({ finalPriceCents: 9000, paidCents: 9000, method: "pix" }),
          { ...completed({ finalPriceCents: 5000, paidCents: 2000, method: "cash" }), id: "b" },
        ],
        periodLabel: "no dia",
      }),
    );
    expect(html).toContain("Financeiro no dia");
    expect(html).toContain("R$ 90,00");
    expect(html).toContain("R$ 30,00");
    expect(html).toContain("Pix");
    expect(html).not.toContain("Dinheiro");
    expect(html).toContain("Corte (1)");
  });

  it("hides breakdowns for an empty period", () => {
    const html = renderToStaticMarkup(
      createElement(FinancialSummaryPanel, { appointments: [], periodLabel: "no mês" }),
    );
    expect(html).toContain("R$ 0,00");
    expect(html).not.toContain("Por forma de pagamento");
  });
});
