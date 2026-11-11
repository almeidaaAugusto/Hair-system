import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminApp: vi.fn(),
  verifyIdToken: vi.fn(),
  verifySessionCookie: vi.fn(),
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({
    verifyIdToken: mocks.verifyIdToken,
    verifySessionCookie: mocks.verifySessionCookie,
  }),
}));

vi.mock("@/server/firebase/admin", () => ({
  getAdminApp: mocks.getAdminApp,
}));

import { AuthorizationError, authenticateAdmin, verifyAdminIdToken } from "./admin-context";

describe("authenticateAdmin", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each(["auth/internal-error", "auth/invalid-credential", "auth/insufficient-permission"])(
    "propagates Firebase infrastructure or configuration failure %s without invalidating credentials",
    async (code) => {
      const failure = Object.assign(new Error("private provider details"), { code });
      mocks.verifyIdToken.mockRejectedValue(failure);

      await expect(verifyAdminIdToken("valid-token")).rejects.toBe(failure);
      await expect(
        authenticateAdmin(
          new Request("http://localhost/api/admin/services", {
            headers: { Authorization: "Bearer valid-token" },
          }),
        ),
      ).rejects.toBe(failure);
    },
  );

  it.each([
    "auth/argument-error",
    "auth/invalid-id-token",
    "auth/id-token-expired",
    "auth/id-token-revoked",
    "auth/user-disabled",
    "auth/user-not-found",
  ])("rejects invalid ID-token credentials %s with a bounded 401", async (code) => {
    mocks.verifyIdToken.mockRejectedValue(Object.assign(new Error("private details"), { code }));

    await expect(verifyAdminIdToken("invalid-token")).rejects.toMatchObject({
      message: "Token de autenticação inválido.",
      status: 401,
    });
  });

  it("maps an invalid Firebase ID token to a generic 401 authorization error", async () => {
    const invalidTokenError = Object.assign(new Error("token expired"), {
      code: "auth/id-token-expired",
    });
    mocks.verifyIdToken.mockRejectedValue(invalidTokenError);

    const error = await authenticateAdmin(
      new Request("http://localhost/api/admin/services", {
        headers: { Authorization: "Bearer invalid-token" },
      }),
    ).catch((error: unknown) => error);

    expect(error).toBeInstanceOf(AuthorizationError);
    expect(error).toMatchObject({
      message: "Token de autenticação inválido.",
      status: 401,
    });
    expect((error as Error).message).not.toContain("token expired");
  });

  it("checks whether an administrative token has been revoked", async () => {
    mocks.verifyIdToken.mockResolvedValue({
      admin: true,
      auth_time: 123,
      salonId: "salon-1",
      uid: "user-1",
    });

    await expect(
      authenticateAdmin(
        new Request("http://localhost/api/admin/services", {
          headers: { Authorization: "Bearer valid-token" },
        }),
      ),
    ).resolves.toEqual({ salonId: "salon-1", userId: "user-1" });

    expect(mocks.verifyIdToken).toHaveBeenCalledWith("valid-token", true);
  });

  it("returns the administrative context and auth time from an ID token", async () => {
    mocks.verifyIdToken.mockResolvedValue({
      admin: true,
      auth_time: 123,
      salonId: "salon-1",
      uid: "user-1",
    });

    await expect(verifyAdminIdToken("valid-token")).resolves.toEqual({
      admin: { salonId: "salon-1", userId: "user-1" },
      authTime: 123,
    });
  });

  it("does not fall back to a cookie when an explicit bearer is invalid", async () => {
    mocks.verifyIdToken.mockRejectedValue(
      Object.assign(new Error("token expired"), { code: "auth/id-token-expired" }),
    );

    await expect(
      authenticateAdmin(
        new Request("http://localhost/api/admin/services", {
          headers: {
            Authorization: "Bearer expired-token",
            Cookie: "admin_session=session-cookie",
          },
        }),
      ),
    ).rejects.toMatchObject({ status: 401 });

    expect(mocks.verifySessionCookie).not.toHaveBeenCalled();
  });

  it("uses the parsed session cookie when the authorization header is absent", async () => {
    mocks.verifySessionCookie.mockResolvedValue({
      admin: true,
      salonId: "salon-1",
      uid: "user-1",
    });

    await expect(
      authenticateAdmin(
        new Request("http://localhost/api/admin/services", {
          headers: { Cookie: "theme=dark; admin_session=session=value; locale=pt-BR" },
        }),
      ),
    ).resolves.toEqual({ salonId: "salon-1", userId: "user-1" });

    expect(mocks.verifySessionCookie).toHaveBeenCalledWith("session=value", true);
  });

  it.each(["", " ", "Basic invalid-token"])(
    "rejects an explicitly malformed authorization header %j without cookie fallback",
    async (authorization) => {
      mocks.verifySessionCookie.mockResolvedValue({
        admin: true,
        salonId: "salon-1",
        uid: "user-1",
      });

      await expect(
        authenticateAdmin(
          new Request("http://localhost/api/admin/services", {
            headers: { Authorization: authorization, Cookie: "admin_session=valid-session" },
          }),
        ),
      ).rejects.toMatchObject({ status: 401 });
      expect(mocks.verifySessionCookie).not.toHaveBeenCalled();
    },
  );

  it("rejects requests without a bearer token or session cookie", async () => {
    await expect(
      authenticateAdmin(new Request("http://localhost/api/admin/services")),
    ).rejects.toMatchObject({ status: 401 });
  });
});
