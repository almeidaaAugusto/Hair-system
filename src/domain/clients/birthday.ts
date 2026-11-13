import { z } from "zod";

export const MIN_BIRTHDAY_YEAR = 1900;
export const MAX_BIRTHDAY_YEAR = 2100;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Days in the month; without a year, February accepts 29 (the birthday may be a leap day). */
export function daysInMonth(month: number, year?: number): number {
  if (month === 2) return year === undefined || isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export const birthdaySchema = z
  .object({
    day: z.number().int().min(1).max(31),
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(MIN_BIRTHDAY_YEAR).max(MAX_BIRTHDAY_YEAR).optional(),
  })
  .strict()
  .refine((birthday) => birthday.day <= daysInMonth(birthday.month, birthday.year), {
    message: "Data de aniversário inválida.",
    path: ["day"],
  });
export type Birthday = z.infer<typeof birthdaySchema>;
