import { describe, expect, it, vi } from "vitest";

import { createService, updateService } from "./create-service";

describe("createService", () => {
  it("persiste o serviço no salão derivado do token", async () => {
    const repository = {
      create: vi.fn().mockResolvedValue({ id: "service-1" }),
      list: vi.fn(),
      update: vi.fn(),
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
    const repository = { create: vi.fn(), list: vi.fn(), update: vi.fn() };

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

  it("rejects a salonId supplied in a create request", async () => {
    const repository = { create: vi.fn(), list: vi.fn(), update: vi.fn() };

    await expect(
      createService(
        {
          name: "Corte",
          durationMinutes: 60,
          startingPriceCents: 8_000,
          hasVariablePrice: false,
          requiresEvaluation: false,
          isActive: true,
          salonId: "other-salon",
        },
        { salonId: "salon-from-token", userId: "admin-1" },
        repository,
      ),
    ).rejects.toThrow();

    expect(repository.create).not.toHaveBeenCalled();
  });

  it("updates allowed fields in the salon derived from the token", async () => {
    const repository = {
      create: vi.fn(),
      list: vi.fn(),
      update: vi.fn().mockResolvedValue({ id: "service-1" }),
    };
    await updateService(
      "service-1",
      {
        name: "Corte atualizado",
        durationMinutes: 75,
        startingPriceCents: 9_000,
        hasVariablePrice: false,
        requiresEvaluation: false,
        isActive: false,
      },
      { salonId: "salon-from-token", userId: "admin-1" },
      repository,
    );

    expect(repository.update).toHaveBeenCalledWith("salon-from-token", "service-1", {
      name: "Corte atualizado",
      durationMinutes: 75,
      startingPriceCents: 9_000,
      hasVariablePrice: false,
      requiresEvaluation: false,
      isActive: false,
    });
  });

  it("updates only the active status without resending the editable fields", async () => {
    const repository = {
      create: vi.fn(),
      list: vi.fn(),
      update: vi.fn().mockResolvedValue({ id: "service-1" }),
    };

    await updateService(
      "service-1",
      { isActive: false },
      { salonId: "salon-from-token", userId: "admin-1" },
      repository,
    );

    expect(repository.update).toHaveBeenCalledWith("salon-from-token", "service-1", {
      isActive: false,
    });
  });

  it("does not update invalid service data", async () => {
    const repository = { create: vi.fn(), list: vi.fn(), update: vi.fn() };

    await expect(
      updateService(
        "service-1",
        {
          name: "Corte",
          durationMinutes: -1,
          startingPriceCents: 9_000,
          hasVariablePrice: false,
          requiresEvaluation: false,
          isActive: true,
        },
        { salonId: "salon-from-token", userId: "admin-1" },
        repository,
      ),
    ).rejects.toThrow();

    expect(repository.update).not.toHaveBeenCalled();
  });
});
