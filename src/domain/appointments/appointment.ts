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
export const availabilityQuerySchema = dayQuerySchema.extend({ serviceId: documentIdSchema });

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

export const appointmentSchema = z
  .object({
    ...recordShape,
    occupiedUntilAt: utcMinuteSchema,
    status: z.enum(["confirmed", "cancelled"]),
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
export type AppointmentRuleErrorCode =
  | "NOT_FOUND"
  | "SERVICE_UNAVAILABLE"
  | "OUTSIDE_BUSINESS_HOURS"
  | "CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_TIME_RANGE";

export class AppointmentRuleError extends Error {
  constructor(
    public readonly code: AppointmentRuleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppointmentRuleError";
  }
}
