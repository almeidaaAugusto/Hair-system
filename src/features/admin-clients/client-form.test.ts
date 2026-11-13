import { describe, expect, it } from "vitest";

import {
  buildChemicalEntryPayload,
  buildCreatePayload,
  buildPatchPayload,
  clientToFields,
  emptyClientFields,
  parseBirthday,
  parseInstagram,
} from "./client-form";
import type { ClientRecord } from "./client-types";

describe("parseInstagram", () => {
  it("normalizes handles", () => {
    expect(parseInstagram(" @Maria.Silva ")).toBe("maria.silva");
    expect(parseInstagram("")).toBeUndefined();
  });

  it("rejects invalid handles", () => {
    expect(parseInstagram("maria silva")).toBeNull();
    expect(parseInstagram("a".repeat(31))).toBeNull();
  });
});

describe("parseBirthday", () => {
  it("accepts day/month with optional year", () => {
    expect(parseBirthday("5", "3", "")).toEqual({ day: 5, month: 3 });
    expect(parseBirthday("5", "3", "1990")).toEqual({ day: 5, month: 3, year: 1990 });
    expect(parseBirthday("", "", "")).toBeUndefined();
  });

  it("allows 29/02 without year or in a leap year only", () => {
    expect(parseBirthday("29", "2", "")).toEqual({ day: 29, month: 2 });
    expect(parseBirthday("29", "2", "2000")).toEqual({ day: 29, month: 2, year: 2000 });
    expect(parseBirthday("29", "2", "1999")).toBe("Esse dia não existe nesse mês.");
    expect(parseBirthday("29", "2", "1900")).toBe("Esse dia não existe nesse mês.");
  });

  it("rejects incomplete or out-of-range values", () => {
    expect(parseBirthday("5", "", "")).toMatch(/dia e mês/);
    expect(parseBirthday("", "", "1990")).toMatch(/dia e mês/);
    expect(parseBirthday("31", "4", "")).toBe("Esse dia não existe nesse mês.");
    expect(parseBirthday("1", "13", "")).toMatch(/mês/);
    expect(parseBirthday("1", "1", "90")).toMatch(/4 dígitos/);
    expect(parseBirthday("1", "1", "2999", 2026)).toMatch(/ano/);
  });
});

describe("buildCreatePayload", () => {
  it("builds a minimal payload", () => {
    expect(
      buildCreatePayload({ ...emptyClientFields, name: " Ana ", phone: "(11) 98888-7777" }),
    ).toEqual({ name: "Ana", phone: "(11) 98888-7777" });
  });

  it("includes optional fields when filled", () => {
    expect(
      buildCreatePayload({
        name: "Ana",
        phone: "11988887777",
        instagram: "@Ana",
        birthDay: "5",
        birthMonth: "3",
        birthYear: "",
        notes: " alergia ",
      }),
    ).toEqual({
      name: "Ana",
      phone: "11988887777",
      instagram: "ana",
      birthday: { day: 5, month: 3 },
      notes: "alergia",
    });
  });

  it("returns messages for invalid input", () => {
    expect(buildCreatePayload({ ...emptyClientFields, phone: "11988887777" })).toBe(
      "Informe o nome da cliente.",
    );
    expect(buildCreatePayload({ ...emptyClientFields, name: "Ana", phone: "123" })).toBe(
      "Informe o telefone com DDD.",
    );
  });
});

describe("buildPatchPayload", () => {
  const current: ClientRecord = {
    id: "c1",
    name: "Ana",
    phone: "5511988887777",
    instagram: "ana",
    birthday: { day: 5, month: 3 },
    notes: "alergia",
    chemicalHistory: [],
  };

  it("sends nothing when unchanged (phone compared by digits)", () => {
    expect(buildPatchPayload(current, clientToFields(current))).toEqual({});
    expect(
      buildPatchPayload(current, { ...clientToFields(current), phone: "+55 (11) 98888-7777" }),
    ).toEqual({});
  });

  it("sends only changed fields", () => {
    expect(
      buildPatchPayload(current, { ...clientToFields(current), name: "Ana Maria", notes: "x" }),
    ).toEqual({ name: "Ana Maria", notes: "x" });
    expect(
      buildPatchPayload(current, { ...clientToFields(current), phone: "11 97777-6666" }),
    ).toEqual({ phone: "11 97777-6666" });
  });

  it("sends null for cleared optional fields", () => {
    expect(
      buildPatchPayload(current, {
        ...clientToFields(current),
        instagram: "",
        birthDay: "",
        birthMonth: "",
        notes: "",
      }),
    ).toEqual({ instagram: null, birthday: null, notes: null });
  });
});

describe("buildChemicalEntryPayload", () => {
  it("builds the payload and drops empty optionals", () => {
    expect(
      buildChemicalEntryPayload({
        localDate: "2026-11-13",
        procedure: " Progressiva ",
        product: "",
        notes: " ok ",
      }),
    ).toEqual({ localDate: "2026-11-13", procedure: "Progressiva", notes: "ok" });
  });

  it("requires date and procedure", () => {
    expect(
      buildChemicalEntryPayload({ localDate: "", procedure: "x", product: "", notes: "" }),
    ).toMatch(/data/);
    expect(
      buildChemicalEntryPayload({
        localDate: "2026-11-13",
        procedure: " ",
        product: "",
        notes: "",
      }),
    ).toMatch(/procedimento/);
  });
});
