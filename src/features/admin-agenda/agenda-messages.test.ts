import { describe, expect, it } from "vitest";

import { appointmentSchema } from "@/domain/appointments/appointment";

import { buildMessage, getMessageUrl } from "./agenda-messages";

const appointment = appointmentSchema.parse({
  id: "a1",
  salonId: "salon",
  professionalId: "primary",
  localDate: "2026-11-16",
  startAt: "2026-11-16T12:30:00.000Z",
  endAt: "2026-11-16T13:30:00.000Z",
  occupiedUntilAt: "2026-11-16T13:40:00.000Z",
  status: "confirmed",
  client: { name: "Ana Maria Souza", phone: "11999999999" },
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

describe("WhatsApp messages", () => {
  it("builds the confirmation with service, local date/time, duration and price", () => {
    const text = buildMessage("confirmation", appointment);
    expect(text).toContain("Olá, Ana!");
    expect(text).toContain("Corte, segunda-feira, 16/11 às 09:30.");
    expect(text).toContain("Duração aproximada: 60 min.");
    expect(text).toContain("Valor: a partir de R$ 80,00.");
  });

  it("builds the reminder asking for confirmation", () => {
    const text = buildMessage("reminder", appointment);
    expect(text).toContain("lembrar do seu horário");
    expect(text).toContain("segunda-feira, 16/11 às 09:30");
    expect(text).toContain("confirmar sua presença");
  });

  it("builds the post-service message", () => {
    expect(buildMessage("post-service", appointment)).toContain("Obrigada pela visita");
  });

  it("encodes the text in a wa.me link with the Brazilian country code", () => {
    const url = new URL(getMessageUrl("reminder", appointment));
    expect(url.origin + url.pathname).toBe("https://wa.me/5511999999999");
    expect(url.searchParams.get("text")).toBe(buildMessage("reminder", appointment));
  });
});
