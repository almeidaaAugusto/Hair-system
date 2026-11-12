import {
  AppointmentRuleError,
  appointmentSchema,
  paymentMethods,
  paymentSchema,
  type Appointment,
  type Payment,
  type PaymentMethod,
} from "./appointment";

type Actor = { userId: string; now: string };

export type PaymentStatus = "not_recorded" | "unpaid" | "partial" | "paid";

function invalidTransition(message: string): never {
  throw new AppointmentRuleError("INVALID_TRANSITION", message);
}

function assertStarted(appointment: Appointment, now: string): void {
  if (Date.parse(now) < Date.parse(appointment.startAt)) {
    throw new AppointmentRuleError(
      "NOT_STARTED",
      "O atendimento só pode ser encerrado a partir do horário de início.",
    );
  }
}

/** Fields a command changed; the repository persists only these. */
export type AppointmentChange = {
  appointment: Appointment;
  changed: (keyof Appointment)[];
};

function apply(
  appointment: Appointment,
  patch: Partial<Appointment>,
  actor: Actor,
): AppointmentChange {
  const next = appointmentSchema.parse({
    ...appointment,
    ...patch,
    updatedAt: actor.now,
    updatedBy: actor.userId,
  });
  return {
    appointment: next,
    changed: [...(Object.keys(patch) as (keyof Appointment)[]), "updatedAt", "updatedBy"],
  };
}

/**
 * Confirmed → completed. Repeating the command on a completed appointment is
 * idempotent; an included payment is then recorded as well.
 */
export function completeAppointment(
  appointment: Appointment,
  actor: Actor,
  payment?: Payment,
): AppointmentChange | null {
  if (appointment.status === "completed") {
    return payment ? recordPayment(appointment, payment, actor) : null;
  }
  if (appointment.status !== "confirmed")
    invalidTransition("Somente atendimentos confirmados podem ser concluídos.");
  assertStarted(appointment, actor.now);
  return apply(
    appointment,
    {
      status: "completed",
      completedAt: actor.now,
      ...(payment ? { payment: paymentSchema.parse(payment), paymentUpdatedAt: actor.now } : {}),
    },
    actor,
  );
}

/** Confirmed → no_show; the record stays in history and never counts as revenue. */
export function markNoShow(appointment: Appointment, actor: Actor): AppointmentChange | null {
  if (appointment.status === "no_show") return null;
  if (appointment.status !== "confirmed")
    invalidTransition("Somente atendimentos confirmados podem ser marcados como falta.");
  assertStarted(appointment, actor.now);
  return apply(appointment, { status: "no_show", noShowAt: actor.now }, actor);
}

/** Records (or corrects) the payment of a completed appointment. */
export function recordPayment(
  appointment: Appointment,
  payment: Payment,
  actor: Actor,
): AppointmentChange {
  if (appointment.status !== "completed")
    invalidTransition("O pagamento é registrado depois que o atendimento é concluído.");
  return apply(
    appointment,
    { payment: paymentSchema.parse(payment), paymentUpdatedAt: actor.now },
    actor,
  );
}

export const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

/** A reminder is due within 24h before the start, once, for confirmed appointments (RN-10). */
export function isReminderDue(appointment: Appointment, now: string): boolean {
  const remaining = Date.parse(appointment.startAt) - Date.parse(now);
  return (
    appointment.status === "confirmed" &&
    appointment.reminderSentAt === undefined &&
    remaining > 0 &&
    remaining <= REMINDER_WINDOW_MS
  );
}

/**
 * Records that the reminder was sent. The first instant is kept: a reminder
 * is never registered twice.
 */
export function markReminderSent(appointment: Appointment, actor: Actor): AppointmentChange | null {
  if (appointment.reminderSentAt !== undefined) return null;
  if (appointment.status !== "confirmed")
    invalidTransition("Lembretes são registrados apenas para atendimentos confirmados.");
  return apply(appointment, { reminderSentAt: actor.now }, actor);
}

/** Records, manually, that the client confirmed attendance (RN-11). */
export function markClientConfirmed(
  appointment: Appointment,
  actor: Actor,
): AppointmentChange | null {
  if (appointment.clientConfirmedAt !== undefined) return null;
  if (appointment.status !== "confirmed")
    invalidTransition("A presença é confirmada apenas em atendimentos confirmados.");
  return apply(appointment, { clientConfirmedAt: actor.now }, actor);
}

/** Only confirmed appointments can be cancelled; finished ones keep their history. */
export function assertCancellable(appointment: Appointment): void {
  if (appointment.status === "completed" || appointment.status === "no_show")
    invalidTransition("Atendimentos concluídos ou com falta não podem ser cancelados.");
}

export function getBalanceCents(payment: Payment): number {
  return payment.finalPriceCents - payment.paidCents;
}

export function getPaymentStatus(appointment: Appointment): PaymentStatus {
  const payment = appointment.payment;
  if (!payment) return "not_recorded";
  if (payment.paidCents >= payment.finalPriceCents) return "paid";
  return payment.paidCents === 0 ? "unpaid" : "partial";
}

export function isReceivedRevenue(appointment: Appointment): boolean {
  return appointment.status === "completed" && getPaymentStatus(appointment) === "paid";
}

export type FinancialSummary = {
  receivedCents: number;
  receivedCount: number;
  openBalanceCents: number;
  openCount: number;
  withoutPaymentCount: number;
  completedCount: number;
  noShowCount: number;
  cancelledCount: number;
  byMethod: Record<PaymentMethod, number>;
  byService: { serviceId: string; name: string; receivedCents: number; count: number }[];
};

/**
 * Financial summary for the appointments of a period (RN-12): only completed
 * and fully paid appointments enter the received total; balances of partially
 * paid or unpaid completed appointments stay separate as open values.
 */
export function summarizeFinancials(appointments: readonly Appointment[]): FinancialSummary {
  const summary: FinancialSummary = {
    receivedCents: 0,
    receivedCount: 0,
    openBalanceCents: 0,
    openCount: 0,
    withoutPaymentCount: 0,
    completedCount: 0,
    noShowCount: 0,
    cancelledCount: 0,
    byMethod: Object.fromEntries(paymentMethods.map((method) => [method, 0])) as Record<
      PaymentMethod,
      number
    >,
    byService: [],
  };
  const services = new Map<string, FinancialSummary["byService"][number]>();
  for (const appointment of appointments) {
    if (appointment.status === "no_show") summary.noShowCount++;
    if (appointment.status === "cancelled") summary.cancelledCount++;
    if (appointment.status !== "completed") continue;
    summary.completedCount++;
    const payment = appointment.payment;
    if (!payment) {
      summary.withoutPaymentCount++;
      continue;
    }
    if (!isReceivedRevenue(appointment)) {
      summary.openBalanceCents += getBalanceCents(payment);
      summary.openCount++;
      continue;
    }
    summary.receivedCents += payment.finalPriceCents;
    summary.receivedCount++;
    if (payment.method) summary.byMethod[payment.method] += payment.finalPriceCents;
    const { serviceId, name } = appointment.serviceSnapshot;
    const service = services.get(serviceId) ?? { serviceId, name, receivedCents: 0, count: 0 };
    service.receivedCents += payment.finalPriceCents;
    service.count++;
    services.set(serviceId, service);
  }
  summary.byService = [...services.values()].sort(
    (a, b) => b.receivedCents - a.receivedCents || a.name.localeCompare(b.name),
  );
  return summary;
}
