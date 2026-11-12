import {
  paymentSchema,
  type Appointment,
  type AppointmentStatus,
  type Payment,
  type PaymentMethod,
} from "@/domain/appointments/appointment";
import { getBalanceCents, getPaymentStatus } from "@/domain/appointments/attendance";
import { formatBrazilianReal, parseBrazilianRealToCents } from "@/features/admin-services/money";

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  pix: "Pix",
  cash: "Dinheiro",
  debit: "Cartão de débito",
  credit: "Cartão de crédito",
};

export const appointmentStatusLabels: Record<AppointmentStatus, string> = {
  confirmed: "Confirmado",
  completed: "Concluído",
  no_show: "Faltou",
  cancelled: "Cancelado",
};

/** Short financial label shown next to a completed appointment. */
export function describePayment(appointment: Appointment): string | undefined {
  if (appointment.status !== "completed") return undefined;
  const payment = appointment.payment;
  switch (getPaymentStatus(appointment)) {
    case "not_recorded":
      return "Pagamento não registrado";
    case "paid":
      return `Pago ${formatBrazilianReal(payment!.finalPriceCents)}${payment!.method ? ` · ${paymentMethodLabels[payment!.method]}` : ""}`;
    case "partial":
      return `Parcial: em aberto ${formatBrazilianReal(getBalanceCents(payment!))}`;
    case "unpaid":
      return `Não pago: em aberto ${formatBrazilianReal(payment!.finalPriceCents)}`;
  }
}

export function isAppointmentStarted(appointment: Appointment, now: Date = new Date()): boolean {
  return now.getTime() >= Date.parse(appointment.startAt);
}

export type PaymentFields = {
  finalPrice: string;
  paidPrice: string;
  method: PaymentMethod | "";
};

export function getDefaultPaymentFields(appointment: Appointment): PaymentFields {
  const payment = appointment.payment;
  const finalPriceCents =
    payment?.finalPriceCents ?? appointment.serviceSnapshot.startingPriceCents;
  const toField = (cents: number) => formatBrazilianReal(cents).replace(/^R\$\s/, "");
  return {
    finalPrice: toField(finalPriceCents),
    paidPrice: toField(payment?.paidCents ?? finalPriceCents),
    method: payment?.method ?? "",
  };
}

/** Converts form text into a payment, or returns the message to show. */
export function buildPaymentInput(fields: PaymentFields): Payment | string {
  const finalPriceCents = parseBrazilianRealToCents(fields.finalPrice);
  const paidCents = parseBrazilianRealToCents(fields.paidPrice === "" ? "0" : fields.paidPrice);
  if (finalPriceCents === undefined || paidCents === undefined)
    return "Informe os valores como 120,00 ou 1.234,56.";
  if (paidCents > finalPriceCents) return "O valor pago não pode ser maior que o valor final.";
  if (paidCents > 0 && !fields.method) return "Informe a forma de pagamento.";
  const result = paymentSchema.safeParse({
    finalPriceCents,
    paidCents,
    ...(fields.method ? { method: fields.method } : {}),
  });
  return result.success ? result.data : "Confira os valores informados.";
}
