import { describe, expect, it } from "vitest";

import {
  canChooseStartTime,
  createPendingOverride,
  getAppointmentExceptions,
  parseOverridableError,
  resolveStartAt,
} from "./booking-exceptions";

describe("parseOverridableError", () => {
  it("recognises overridable 409s", () => {
    expect(
      parseOverridableError(409, { code: "OUTSIDE_BUSINESS_HOURS", overridable: true, error: "x" }),
    ).toEqual({ code: "OUTSIDE_BUSINESS_HOURS", warning: "Este horário está fora do expediente." });
    expect(
      parseOverridableError(409, { code: "SERVICE_REQUIRES_EVALUATION", overridable: true })
        ?.warning,
    ).toBe("Este serviço exige avaliação prévia.");
  });

  it("ignores everything that cannot be overridden", () => {
    expect(parseOverridableError(409, { code: "CONFLICT", overridable: true })).toBeUndefined();
    expect(parseOverridableError(409, { code: "OUTSIDE_BUSINESS_HOURS" })).toBeUndefined();
    expect(
      parseOverridableError(400, { code: "OUTSIDE_BUSINESS_HOURS", overridable: true }),
    ).toBeUndefined();
    expect(parseOverridableError(409, null)).toBeUndefined();
  });
});

describe("getAppointmentExceptions", () => {
  it("treats missing or unknown exceptions as empty", () => {
    expect(getAppointmentExceptions({})).toEqual([]);
    expect(
      getAppointmentExceptions({
        exceptions: ["requiresEvaluation", "other" as "requiresEvaluation"],
      }),
    ).toEqual(["requiresEvaluation"]);
  });
});

describe("resolveStartAt", () => {
  const base = { date: "2026-11-16", startAt: "", useCustomTime: false, customTime: "" };

  it("uses the chosen free slot", () => {
    expect(resolveStartAt({ ...base, startAt: "2026-11-16T12:00:00.000Z" })).toEqual({
      startAt: "2026-11-16T12:00:00.000Z",
    });
    expect(resolveStartAt(base)).toEqual({ error: "Escolha o horário." });
  });

  it("converts a typed São Paulo time to UTC", () => {
    expect(resolveStartAt({ ...base, useCustomTime: true, customTime: "07:30" })).toEqual({
      startAt: "2026-11-16T10:30:00.000Z",
    });
    expect(resolveStartAt({ ...base, useCustomTime: true, customTime: "" })).toEqual({
      error: "Informe o horário de início.",
    });
  });
});

describe("createPendingOverride", () => {
  it("carries the payload with a new request id", () => {
    const pending = createPendingOverride(
      { code: "OUTSIDE_BUSINESS_HOURS", warning: "w" },
      { a: 1 },
      () => "new-id",
    );
    expect(pending.requestId).toBe("new-id");
    expect(pending.payload).toEqual({ a: 1 });
  });
});

describe("canChooseStartTime", () => {
  const base = {
    availabilityReady: false,
    useCustomTime: true,
    serviceId: "svc",
    date: "2026-11-14",
  };

  it("allows a typed time once service and date are chosen, even without free slots", () => {
    expect(canChooseStartTime(base)).toBe(true);
  });

  it("rejects a typed time without service or with a malformed date", () => {
    expect(canChooseStartTime({ ...base, serviceId: "" })).toBe(false);
    expect(canChooseStartTime({ ...base, date: "" })).toBe(false);
    expect(canChooseStartTime({ ...base, date: "dddd-dd-dd" })).toBe(false);
  });

  it("requires loaded availability when picking from the slot list", () => {
    expect(canChooseStartTime({ ...base, useCustomTime: false })).toBe(false);
    expect(canChooseStartTime({ ...base, useCustomTime: false, availabilityReady: true })).toBe(
      true,
    );
  });
});
