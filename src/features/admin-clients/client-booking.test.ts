import { describe, expect, it } from "vitest";

import {
  isLookupablePhone,
  needsClientName,
  resolveBookingAttempt,
  resolveClientReference,
  type ClientLookupState,
} from "./client-booking";

describe("isLookupablePhone", () => {
  it("accepts 10 to 15 digits in any format", () => {
    expect(isLookupablePhone("(11) 98888-7777")).toBe(true);
    expect(isLookupablePhone("11 3888-7777")).toBe(true);
    expect(isLookupablePhone("+55 11 98888-7777")).toBe(true);
  });

  it("rejects too short or too long", () => {
    expect(isLookupablePhone("119888")).toBe(false);
    expect(isLookupablePhone("123456789")).toBe(false);
    expect(isLookupablePhone("1234567890123456")).toBe(false);
  });
});

const phone = "(11) 98888-7777";
const found: ClientLookupState = { status: "found", clientId: "c1", name: "Maria" };

describe("resolveClientReference", () => {
  it("uses clientId when the lookup found the client (name ignored)", () => {
    expect(resolveClientReference({ phone, name: "", lookup: found })).toEqual({ clientId: "c1" });
  });

  it("sends client name and phone when not found", () => {
    expect(
      resolveClientReference({ phone, name: " Ana ", lookup: { status: "not_found" } }),
    ).toEqual({ client: { name: "Ana", phone } });
  });

  it("still allows booking with client when the lookup failed", () => {
    expect(resolveClientReference({ phone, name: "Ana", lookup: { status: "error" } })).toEqual({
      client: { name: "Ana", phone },
    });
  });

  it("requires a name when there is no client record", () => {
    expect(resolveClientReference({ phone, name: " ", lookup: { status: "not_found" } })).toEqual({
      error: "Informe o nome da cliente.",
    });
  });

  it("waits for a pending lookup and rejects invalid phones", () => {
    expect(
      resolveClientReference({ phone, name: "Ana", lookup: { status: "loading" } }),
    ).toHaveProperty("error");
    expect(
      resolveClientReference({ phone: "123", name: "Ana", lookup: { status: "idle" } }),
    ).toHaveProperty("error");
  });
});

describe("needsClientName", () => {
  it("asks for the name only when a valid phone has no match", () => {
    expect(needsClientName(phone, { status: "not_found" })).toBe(true);
    expect(needsClientName(phone, { status: "error" })).toBe(true);
    expect(needsClientName(phone, found)).toBe(false);
    expect(needsClientName(phone, { status: "loading" })).toBe(false);
    expect(needsClientName("123", { status: "idle" })).toBe(false);
  });
});

describe("resolveBookingAttempt", () => {
  const ids = () => {
    let n = 0;
    return () => `id-${++n}`;
  };
  const newClient = { client: { name: "Ana", phone: "(11) 98888-7777" } };

  it("creates an attempt with a new request id and the resolved reference", () => {
    const result = resolveBookingAttempt(undefined, "form-1", () => newClient, ids());
    expect(result).toEqual({
      attempt: { formKey: "form-1", requestId: "id-1", reference: newClient },
    });
  });

  it("reuses request id and reference on retry of the same form, even if the lookup changed", () => {
    const newId = ids();
    const first = resolveBookingAttempt(undefined, "form-1", () => newClient, newId);
    const retry = resolveBookingAttempt(
      "attempt" in first ? first.attempt : undefined,
      "form-1",
      () => ({ clientId: "c1" }),
      newId,
    );
    expect(retry).toEqual(first);
  });

  it("starts a new attempt when the form was edited", () => {
    const newId = ids();
    const first = resolveBookingAttempt(undefined, "form-1", () => newClient, newId);
    const edited = resolveBookingAttempt(
      "attempt" in first ? first.attempt : undefined,
      "form-2",
      () => ({ clientId: "c1" }),
      newId,
    );
    expect(edited).toEqual({
      attempt: { formKey: "form-2", requestId: "id-2", reference: { clientId: "c1" } },
    });
  });

  it("returns the reference error without creating an attempt", () => {
    expect(
      resolveBookingAttempt(undefined, "f", () => ({ error: "Informe o nome da cliente." }), ids()),
    ).toEqual({ error: "Informe o nome da cliente." });
  });
});
