import { describe, expect, it } from "vitest";

import { createServiceSchema, updateServiceSchema } from "./service";

describe("createServiceSchema", () => {
  it("aceita um serviço com preço variável e avaliação", () => {
    const result = createServiceSchema.safeParse({
      name: "Coloração",
      durationMinutes: 120,
      startingPriceCents: 15_000,
      hasVariablePrice: true,
      requiresEvaluation: true,
      isActive: true,
    });

    expect(result.success).toBe(true);
  });

  it("rejeita duração decimal, preço negativo e nome vazio", () => {
    const result = createServiceSchema.safeParse({
      name: " ",
      durationMinutes: 30.5,
      startingPriceCents: -1,
      hasVariablePrice: false,
      requiresEvaluation: false,
      isActive: true,
    });

    expect(result.success).toBe(false);
  });

  it("rejeita duração zero ou negativa", () => {
    const input = {
      name: "Corte",
      startingPriceCents: 10_000,
      hasVariablePrice: false,
      requiresEvaluation: false,
      isActive: true,
    };

    expect(createServiceSchema.safeParse({ ...input, durationMinutes: 0 }).success).toBe(false);
    expect(createServiceSchema.safeParse({ ...input, durationMinutes: -1 }).success).toBe(false);
  });

  it("normalizes a name and rejects unknown fields", () => {
    const result = createServiceSchema.safeParse({
      name: "  Corte  ",
      durationMinutes: 60,
      startingPriceCents: 10_000,
      hasVariablePrice: false,
      requiresEvaluation: false,
      isActive: true,
      salonId: "attempted-cross-salon-write",
    });

    expect(result.success).toBe(false);
  });

  it("accepts a strict status-only update", () => {
    expect(updateServiceSchema.safeParse({ isActive: false }).success).toBe(true);
    expect(
      updateServiceSchema.safeParse({
        isActive: false,
        salonId: "attempted-cross-salon-write",
      }).success,
    ).toBe(false);
  });
});
