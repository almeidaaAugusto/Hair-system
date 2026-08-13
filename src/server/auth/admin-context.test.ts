import { describe, expect, it } from "vitest";

import { AuthorizationError, getAdminContext, getBearerToken } from "./admin-context";

describe("getAdminContext", () => {
  it("deriva o salão das claims administrativas", () => {
    expect(getAdminContext({ admin: true, salonId: "salon-1", uid: "user-1" })).toEqual({
      salonId: "salon-1",
      userId: "user-1",
    });
  });

  it("rejeita claims sem acesso administrativo", () => {
    expect(() => getAdminContext({ salonId: "salon-1", uid: "user-1" })).toThrow(
      AuthorizationError,
    );
  });
});

describe("getBearerToken", () => {
  it("rejeita uma requisição sem Bearer token", () => {
    expect(() => getBearerToken(null)).toThrow(AuthorizationError);
  });
});
