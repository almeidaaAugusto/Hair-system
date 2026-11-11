import { describe, expect, it } from "vitest";

import { getLoginErrorMessage, getSafeAdminDestination } from "./login-destination";

describe("getSafeAdminDestination", () => {
  it.each(["/admin", "/admin/services", "/admin/services?tab=active"])(
    "keeps the internal administrative destination %s",
    (next) => expect(getSafeAdminDestination(next)).toBe(next),
  );

  it.each([
    undefined,
    "https://evil.example",
    "//evil.example",
    "/other",
    "/administrator",
    "/admin/../login",
    "/admin/%2e%2e/login",
    "/admin/../../evil.example",
    "/admin/\\evil.example",
    "/admin/services\n",
    "/admin/\tservices",
  ])("falls back safely for %s", (next) =>
    expect(getSafeAdminDestination(next)).toBe("/admin/services"),
  );

  it("normalizes an administrative path without allowing it to escape admin", () => {
    expect(getSafeAdminDestination("/admin/business-hours/../services?tab=active")).toBe(
      "/admin/services?tab=active",
    );
  });
});

describe("getLoginErrorMessage", () => {
  it.each([
    "auth/invalid-credential",
    "auth/invalid-email",
    "auth/wrong-password",
    "auth/user-not-found",
  ])("uses bounded copy for invalid credentials reported as %s", (firebaseCode) =>
    expect(getLoginErrorMessage(firebaseCode)).toBe("E-mail ou senha inválidos."),
  );

  it("maps a forbidden session exchange to the administrative authorization message", () => {
    expect(getLoginErrorMessage(undefined, 403)).toBe(
      "Sua conta não possui autorização administrativa.",
    );
  });

  it("does not expose Firebase provider details for unexpected failures", () => {
    expect(getLoginErrorMessage("auth/network-request-failed")).toBe(
      "Não foi possível entrar. Tente novamente.",
    );
  });
});
