import { describe, expect, it } from "vitest";

import { businessHoursInputSchema, createDefaultBusinessHoursInput } from "./business-hours";

describe("businessHoursInputSchema", () => {
  it("fornece a configuração padrão de segunda a sábado, com domingo fechado", () => {
    const configuration = createDefaultBusinessHoursInput();

    expect(configuration.appointmentIntervalMinutes).toBe(10);
    expect(configuration.weeklyHours.monday).toEqual({
      isOpen: true,
      startLocalTime: "09:00",
      endLocalTime: "20:00",
    });
    expect(configuration.weeklyHours.saturday.isOpen).toBe(true);
    expect(configuration.weeklyHours.sunday).toEqual({
      isOpen: false,
      startLocalTime: "09:00",
      endLocalTime: "20:00",
    });
  });

  it("aceita um dia fechado", () => {
    const configuration = createDefaultBusinessHoursInput();
    configuration.weeklyHours.wednesday.isOpen = false;

    expect(businessHoursInputSchema.safeParse(configuration).success).toBe(true);
  });

  it("rejeita horário final igual ou anterior ao horário inicial", () => {
    const configuration = createDefaultBusinessHoursInput();
    configuration.weeklyHours.monday.endLocalTime = "09:00";

    expect(businessHoursInputSchema.safeParse(configuration).success).toBe(false);
  });

  it("rejeita intervalo negativo", () => {
    const configuration = createDefaultBusinessHoursInput();
    configuration.appointmentIntervalMinutes = -1;

    expect(businessHoursInputSchema.safeParse(configuration).success).toBe(false);
  });
});
