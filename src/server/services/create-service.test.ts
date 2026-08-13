import { describe, expect, it, vi } from "vitest";

import { createService } from "./create-service";

describe("createService", () => {
  it("persiste o serviço no salão derivado do token", async () => {
    const repository = {
      create: vi.fn().mockResolvedValue({ id: "service-1" }),
      list: vi.fn(),
    };

    await createService(
      {
        name: "Corte",
        durationMinutes: 60,
        startingPriceCents: 8_000,
        hasVariablePrice: false,
        requiresEvaluation: false,
        isActive: true,
      },
      { salonId: "salon-from-token", userId: "admin-1" },
      repository,
    );

    expect(repository.create).toHaveBeenCalledWith(
      "salon-from-token",
      expect.objectContaining({ name: "Corte", durationMinutes: 60 }),
    );
  });

  it("não persiste dados inválidos", async () => {
    const repository = { create: vi.fn(), list: vi.fn() };

    await expect(
      createService(
        {
          name: "Escova",
          durationMinutes: 0,
          startingPriceCents: 5_000,
          hasVariablePrice: false,
          requiresEvaluation: false,
          isActive: true,
        },
        { salonId: "salon-from-token", userId: "admin-1" },
        repository,
      ),
    ).rejects.toThrow();

    expect(repository.create).not.toHaveBeenCalled();
  });
});
