import { describe, expect, it } from "vitest";
import {
  chemicalEntryInputSchema,
  clientLookupQuerySchema,
  createClientInputSchema,
  updateClientInputSchema,
} from "./client";

const requestId = "123e4567-e89b-42d3-a456-426614174000";

describe("client schemas", () => {
  it("normalizes phone, instagram and trims text on creation", () => {
    expect(
      createClientInputSchema.parse({
        requestId,
        name: "  Ana  ",
        phone: "(11) 99999-1234",
        instagram: "@Ana.Hair",
        birthday: { day: 29, month: 2 },
        notes: "  alérgica  ",
      }),
    ).toEqual({
      requestId,
      name: "Ana",
      phone: "5511999991234",
      instagram: "ana.hair",
      birthday: { day: 29, month: 2 },
      notes: "alérgica",
    });
  });

  it.each([
    { name: "", phone: "11999991234" },
    { name: "x".repeat(121), phone: "11999991234" },
    { name: "Ana", phone: "123" },
    { name: "Ana", phone: "11999991234", instagram: "not valid" },
    { name: "Ana", phone: "11999991234", notes: "x".repeat(2001) },
    { name: "Ana", phone: "11999991234", birthday: { day: 30, month: 2 } },
    { name: "Ana", phone: "11999991234", salonId: "other" },
  ])("rejects invalid creation %j", (value) => {
    expect(createClientInputSchema.safeParse({ requestId, ...value }).success).toBe(false);
  });

  it("accepts notes at the 2000 character limit", () => {
    expect(
      createClientInputSchema.safeParse({
        requestId,
        name: "Ana",
        phone: "11999991234",
        notes: "x".repeat(2000),
      }).success,
    ).toBe(true);
  });

  it("allows partial updates and null to clear, but not an empty update", () => {
    expect(updateClientInputSchema.parse({ phone: "11 98888-7777" })).toEqual({
      phone: "5511988887777",
    });
    expect(updateClientInputSchema.parse({ instagram: null, birthday: null, notes: null })).toEqual(
      { instagram: null, birthday: null, notes: null },
    );
    expect(updateClientInputSchema.safeParse({}).success).toBe(false);
    expect(updateClientInputSchema.safeParse({ name: "" }).success).toBe(false);
    expect(updateClientInputSchema.safeParse({ id: "x" }).success).toBe(false);
  });

  it("validates chemical history entries", () => {
    const base = { requestId, localDate: "2026-11-13", procedure: "Progressiva" };
    expect(chemicalEntryInputSchema.safeParse(base).success).toBe(true);
    expect(
      chemicalEntryInputSchema.safeParse({ ...base, product: "Marca X", notes: "n".repeat(500) })
        .success,
    ).toBe(true);
    expect(chemicalEntryInputSchema.safeParse({ ...base, procedure: "" }).success).toBe(false);
    expect(chemicalEntryInputSchema.safeParse({ ...base, notes: "n".repeat(501) }).success).toBe(
      false,
    );
    expect(chemicalEntryInputSchema.safeParse({ ...base, localDate: "2026-02-30" }).success).toBe(
      false,
    );
    expect(
      chemicalEntryInputSchema.safeParse({ ...base, procedure: "p".repeat(121) }).success,
    ).toBe(false);
  });

  it("canonicalizes the lookup phone", () => {
    expect(clientLookupQuerySchema.parse({ phone: "(11) 99999-1234" }).phone).toBe("5511999991234");
    expect(clientLookupQuerySchema.safeParse({ phone: "12" }).success).toBe(false);
  });
});
