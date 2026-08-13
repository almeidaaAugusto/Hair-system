import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_PROFESSIONAL_ID,
  createDefaultBusinessHoursInput,
} from "@/domain/business-hours/business-hours";

import { getBusinessHoursConfiguration, updateBusinessHours } from "./configure-business-hours";

describe("getBusinessHoursConfiguration", () => {
  it("retorna a configuração padrão para um salão sem expediente salvo", async () => {
    const repository = { get: vi.fn().mockResolvedValue(null), save: vi.fn() };

    const configuration = await getBusinessHoursConfiguration(
      { salonId: "salon-from-token", userId: "admin-1" },
      repository,
    );

    expect(repository.get).toHaveBeenCalledWith("salon-from-token", DEFAULT_PROFESSIONAL_ID);
    expect(configuration.salonId).toBe("salon-from-token");
    expect(configuration.appointmentIntervalMinutes).toBe(10);
    expect(configuration.weeklyHours.sunday.isOpen).toBe(false);
  });
});

describe("updateBusinessHours", () => {
  it("atualiza o expediente no salão derivado do token", async () => {
    const configuration = createDefaultBusinessHoursInput();
    configuration.weeklyHours.friday.endLocalTime = "18:00";
    const repository = {
      get: vi.fn(),
      save: vi.fn().mockResolvedValue({ id: "not-used" }),
    };

    await updateBusinessHours(
      configuration,
      { salonId: "salon-from-token", userId: "admin-1" },
      repository,
    );

    expect(repository.save).toHaveBeenCalledWith(
      "salon-from-token",
      DEFAULT_PROFESSIONAL_ID,
      expect.objectContaining({
        appointmentIntervalMinutes: 10,
        weeklyHours: expect.objectContaining({
          friday: expect.objectContaining({ endLocalTime: "18:00" }),
        }),
      }),
    );
  });

  it("ignora um salonId forjado no corpo da requisição", async () => {
    const repository = { get: vi.fn(), save: vi.fn().mockResolvedValue({}) };
    const configuration = {
      ...createDefaultBusinessHoursInput(),
      salonId: "salon-forged-by-browser",
    };

    await updateBusinessHours(
      configuration,
      { salonId: "salon-from-token", userId: "admin-1" },
      repository,
    );

    expect(repository.save).toHaveBeenCalledWith(
      "salon-from-token",
      DEFAULT_PROFESSIONAL_ID,
      expect.any(Object),
    );
  });

  it("não persiste um horário inválido", async () => {
    const configuration = createDefaultBusinessHoursInput();
    configuration.weeklyHours.monday.endLocalTime = "09:00";
    const repository = { get: vi.fn(), save: vi.fn() };

    await expect(
      updateBusinessHours(
        configuration,
        { salonId: "salon-from-token", userId: "admin-1" },
        repository,
      ),
    ).rejects.toThrow("O horário final deve ser posterior ao inicial.");

    expect(repository.save).not.toHaveBeenCalled();
  });
});
