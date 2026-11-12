import type { Appointment } from "@/domain/appointments/appointment";
import { formatBrazilianReal } from "@/features/admin-services/money";

import { formatLocalTime, getWhatsAppUrl } from "./agenda-calendar";

export type MessageKind = "confirmation" | "reminder" | "post-service";

const dayFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
});

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function describeDay(appointment: Appointment): string {
  return dayFormatter.format(new Date(`${appointment.localDate}T12:00:00.000Z`));
}

function describePrice(appointment: Appointment): string {
  const { startingPriceCents, hasVariablePrice } = appointment.serviceSnapshot;
  return `${hasVariablePrice ? "a partir de " : ""}${formatBrazilianReal(startingPriceCents)}`;
}

/**
 * Ready-to-send texts (RF-COM-01/02/05). The professional reviews and sends
 * them in WhatsApp; nothing is sent automatically.
 */
export function buildMessage(kind: MessageKind, appointment: Appointment): string {
  const name = firstName(appointment.client.name);
  const service = appointment.serviceSnapshot;
  const when = `${describeDay(appointment)} às ${formatLocalTime(appointment.startAt)}`;
  switch (kind) {
    case "confirmation":
      return [
        `Olá, ${name}! Seu horário está confirmado:`,
        `${service.name}, ${when}.`,
        `Duração aproximada: ${service.durationMinutes} min. Valor: ${describePrice(appointment)}.`,
        "Se precisar remarcar, é só responder esta mensagem.",
      ].join("\n");
    case "reminder":
      return [
        `Olá, ${name}! Passando para lembrar do seu horário:`,
        `${service.name}, ${when}.`,
        "Pode confirmar sua presença respondendo esta mensagem?",
      ].join("\n");
    case "post-service":
      return [
        `Olá, ${name}! Obrigada pela visita.`,
        `Espero que tenha gostado do ${service.name.toLowerCase()}.`,
        "Qualquer dúvida sobre os cuidados, estou à disposição!",
      ].join("\n");
  }
}

export function getMessageUrl(kind: MessageKind, appointment: Appointment): string {
  return `${getWhatsAppUrl(appointment.client.phone)}?text=${encodeURIComponent(buildMessage(kind, appointment))}`;
}
