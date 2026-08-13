import { describe, expect, it } from "vitest";

import { createServiceSchema } from "./service";

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
});
