import { z } from "zod";
import { createServiceSchema } from "../services/service";

export const documentIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .refine((id) => !id.includes("/"));
export const localDateSchema = z.iso.date().refine((date) => !date.startsWith("0000-"));
export const utcInstantSchema = z.iso
  .datetime()
  .refine((value) => Number.isFinite(Date.parse(value)))
  .transform((value) => new Date(value).toISOString());
export const utcMinuteSchema = z.iso
  .datetime()
  .refine(
    (value) => /T\d{2}:\d{2}(?::00(?:\.0+)?)?Z$/.test(value),
    "Informe um instante UTC com precisão de minuto.",
  )
  .pipe(utcInstantSchema);

const clientSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[\d\s().-]+$/)
      .transform((phone) => phone.replace(/\D/g, ""))
      .pipe(z.string().regex(/^\d{10,15}$/)),
  })
  .strict();

export const createAppointmentInputSchema = z
  .object({
    requestId: z.uuid(),
    serviceId: documentIdSchema,
    startAt: utcMinuteSchema,
    client: clientSchema,
    source: z.enum(["manual", "whatsapp"]),
  })
  .strict();

export const createTimeBlockInputSchema = z
  .object({
    requestId: z.uuid(),
    startAt: utcMinuteSchema,
    endAt: utcMinuteSchema,
    reason: z.string().trim().max(200).optional(),
  })
  .strict();

export const dayQuerySchema = z.object({ date: localDateSchema }).strict();
export const MAX_AGENDA_RANGE_DAYS = 42;
export function countLocalDays(from: string, to: string): number {
  return (
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
  );
}
export const rangeQuerySchema = z
  .object({ from: localDateSchema, to: localDateSchema })
  .strict()
  .refine(
    ({ from, to }) => from <= to && countLocalDays(from, to) <= MAX_AGENDA_RANGE_DAYS,
    `O período deve ter de 1 a ${MAX_AGENDA_RANGE_DAYS} dias.`,
  );
export const agendaQuerySchema = z.union([dayQuerySchema, rangeQuerySchema]);
export const availabilityQuerySchema = dayQuerySchema.extend({
  serviceId: documentIdSchema,
  /** Ignores this appointment's own period, so it can be moved within the day. */
  excludeAppointmentId: documentIdSchema.optional(),
});

/** Without serviceId the original service snapshot is kept. */
export const rescheduleInputSchema = z
  .object({ startAt: utcMinuteSchema, serviceId: documentIdSchema.optional() })
  .strict();
export type RescheduleInput = z.infer<typeof rescheduleInputSchema>;

export type CreateAppointmentInput = z.infer<typeof createAppointmentInputSchema>;
export type CreateTimeBlockInput = z.infer<typeof createTimeBlockInputSchema>;

const recordShape = {
  id: documentIdSchema,
  salonId: documentIdSchema,
  professionalId: documentIdSchema,
  localDate: localDateSchema,
  startAt: utcMinuteSchema,
  endAt: utcMinuteSchema,
  createdBy: documentIdSchema,
  updatedBy: documentIdSchema,
  createdAt: utcInstantSchema,
  updatedAt: utcInstantSchema,
  cancelledAt: utcInstantSchema.optional(),
};

export const MAX_PAYMENT_CENTS = 10_000_000;
export const paymentMethods = ["pix", "cash", "debit", "credit"] as const;
export const paymentMethodSchema = z.enum(paymentMethods);
const centsSchema = z.number().int().min(0).max(MAX_PAYMENT_CENTS);

/** Final value, amount paid and the method used; the balance is always derived. */
export const paymentSchema = z
  .object({
    finalPriceCents: centsSchema,
    paidCents: centsSchema,
    method: paymentMethodSchema.optional(),
  })
  .strict()
  .refine((payment) => payment.paidCents <= payment.finalPriceCents, {
    message: "O valor pago não pode ser maior que o valor final.",
    path: ["paidCents"],
  })
  .refine((payment) => payment.paidCents === 0 || payment.method !== undefined, {
    message: "Informe a forma de pagamento.",
    path: ["method"],
  });

export const completeAppointmentInputSchema = z
  .object({ payment: paymentSchema.optional() })
  .strict();

export const appointmentStatuses = ["confirmed", "completed", "no_show", "cancelled"] as const;

export const appointmentSchema = z
  .object({
    ...recordShape,
    occupiedUntilAt: utcMinuteSchema,
    status: z.enum(appointmentStatuses),
    completedAt: utcInstantSchema.optional(),
    noShowAt: utcInstantSchema.optional(),
    payment: paymentSchema.optional(),
    paymentUpdatedAt: utcInstantSchema.optional(),
    reminderSentAt: utcInstantSchema.optional(),
    clientConfirmedAt: utcInstantSchema.optional(),
    client: clientSchema,
    serviceSnapshot: createServiceSchema
      .omit({ isActive: true })
      .extend({ serviceId: documentIdSchema }),
    appointmentIntervalMinutes: z.number().int().min(0),
    source: z.enum(["manual", "whatsapp"]),
  })
  .strict()
  .refine(
    (appointment) =>
      (Date.parse(appointment.endAt) - Date.parse(appointment.startAt)) / 60_000 ===
        appointment.serviceSnapshot.durationMinutes &&
      (Date.parse(appointment.occupiedUntilAt) - Date.parse(appointment.endAt)) / 60_000 ===
        appointment.appointmentIntervalMinutes,
    "Os horários devem corresponder à duração e ao intervalo registrados.",
  )
  .refine(
    (appointment) =>
      (appointment.status === "completed") === (appointment.completedAt !== undefined) &&
      (appointment.status === "no_show") === (appointment.noShowAt !== undefined) &&
      (appointment.status === "cancelled") === (appointment.cancelledAt !== undefined) &&
      (appointment.payment === undefined || appointment.status === "completed") &&
      (appointment.payment === undefined) === (appointment.paymentUpdatedAt === undefined),
    "O estado do atendimento não corresponde aos registros de conclusão, falta ou pagamento.",
  );

export const timeBlockSchema = z
  .object({
    ...recordShape,
    status: z.enum(["active", "cancelled"]),
    reason: z.string().trim().max(200).optional(),
  })
  .strict()
  .refine(
    (block) => Date.parse(block.startAt) < Date.parse(block.endAt),
    "O início deve ser anterior ao fim.",
  );

export type Appointment = z.infer<typeof appointmentSchema>;
export type TimeBlock = z.infer<typeof timeBlockSchema>;
export type AppointmentStatus = Appointment["status"];
export type Payment = z.infer<typeof paymentSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type CompleteAppointmentInput = z.infer<typeof completeAppointmentInputSchema>;
export type AppointmentRuleErrorCode =
  | "NOT_FOUND"
  | "SERVICE_UNAVAILABLE"
  | "OUTSIDE_BUSINESS_HOURS"
  | "CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_TIME_RANGE"
  | "INVALID_TRANSITION"
  | "NOT_STARTED";

export class AppointmentRuleError extends Error {
  constructor(
    public readonly code: AppointmentRuleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppointmentRuleError";
  }
}
