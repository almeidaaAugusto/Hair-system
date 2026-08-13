import { z } from "zod";

export const BUSINESS_HOURS_TIME_ZONE = "America/Sao_Paulo";
export const DEFAULT_PROFESSIONAL_ID = "primary";

const localTimeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Informe um horário válido no formato HH:mm.");

function localTimeToMinutes(localTime: string): number {
  const [hours, minutes] = localTime.split(":").map(Number);
  return hours * 60 + minutes;
}

export const businessHoursDaySchema = z
  .object({
    isOpen: z.boolean(),
    startLocalTime: localTimeSchema,
    endLocalTime: localTimeSchema,
  })
  .superRefine((day, context) => {
    if (localTimeToMinutes(day.endLocalTime) <= localTimeToMinutes(day.startLocalTime)) {
      context.addIssue({
        code: "custom",
        path: ["endLocalTime"],
        message: "O horário final deve ser posterior ao inicial.",
      });
    }
  });

export const weeklyHoursSchema = z.object({
  monday: businessHoursDaySchema,
  tuesday: businessHoursDaySchema,
  wednesday: businessHoursDaySchema,
  thursday: businessHoursDaySchema,
  friday: businessHoursDaySchema,
  saturday: businessHoursDaySchema,
  sunday: businessHoursDaySchema,
});

export const businessHoursInputSchema = z.object({
  appointmentIntervalMinutes: z
    .number()
    .int("O intervalo deve ser informado em minutos inteiros.")
    .min(0, "O intervalo entre atendimentos não pode ser negativo."),
  weeklyHours: weeklyHoursSchema,
});

export type BusinessHoursInput = z.infer<typeof businessHoursInputSchema>;

export type BusinessHours = BusinessHoursInput & {
  salonId: string;
  professionalId: string;
  timezone: typeof BUSINESS_HOURS_TIME_ZONE;
};

export const businessHoursSchema = businessHoursInputSchema.extend({
  salonId: z.string().min(1),
  professionalId: z.string().min(1),
  timezone: z.literal(BUSINESS_HOURS_TIME_ZONE),
});

function createBusinessDay(isOpen: boolean) {
  return {
    isOpen,
    startLocalTime: "09:00",
    endLocalTime: "20:00",
  };
}

export function createDefaultBusinessHoursInput(): BusinessHoursInput {
  return {
    appointmentIntervalMinutes: 10,
    weeklyHours: {
      monday: createBusinessDay(true),
      tuesday: createBusinessDay(true),
      wednesday: createBusinessDay(true),
      thursday: createBusinessDay(true),
      friday: createBusinessDay(true),
      saturday: createBusinessDay(true),
      sunday: createBusinessDay(false),
    },
  };
}
