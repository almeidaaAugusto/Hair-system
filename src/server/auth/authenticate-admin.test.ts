import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminSessionCookie: vi.fn(),
  getAdminApp: vi.fn(),
  verifyIdToken: vi.fn(),
  verifyAdminSessionCookie: vi.fn(),
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({ verifyIdToken: mocks.verifyIdToken }),
}));

vi.mock("@/server/firebase/admin", () => ({
  getAdminApp: mocks.getAdminApp,
}));

vi.mock("./admin-session", () => ({
  getAdminSessionCookie: mocks.getAdminSessionCookie,
  verifyAdminSessionCookie: mocks.verifyAdminSessionCookie,
}));

import { AuthorizationError, authenticateAdmin, verifyAdminIdToken } from "./admin-context";

describe("authenticateAdmin", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("maps an invalid Firebase ID token to a generic 401 authorization error", async () => {
    const invalidTokenError = Object.assign(new Error("token expired"), {
      code: "auth/id-token-expired",
    });
    mocks.verifyIdToken.mockRejectedValue(invalidTokenError);

    await expect(
      authenticateAdmin(
        new Request("http://localhost/api/admin/services", {
          headers: { Authorization: "Bearer invalid-token" },
        }),
      ),
    ).rejects.toMatchObject({ status: 401 });

    await expect(
      authenticateAdmin(
        new Request("http://localhost/api/admin/services", {
          headers: { Authorization: "Bearer invalid-token" },
        }),
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
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
    mocks.getAdminSessionCookie.mockReturnValue("session-cookie");

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

    expect(mocks.verifyAdminSessionCookie).not.toHaveBeenCalled();
  });

  it("uses the session cookie when the authorization header is absent", async () => {
    mocks.getAdminSessionCookie.mockReturnValue("session-cookie");
    mocks.verifyAdminSessionCookie.mockResolvedValue({ salonId: "salon-1", userId: "user-1" });

    await expect(
      authenticateAdmin(new Request("http://localhost/api/admin/services")),
    ).resolves.toEqual({ salonId: "salon-1", userId: "user-1" });
  });

  it("rejects requests without a bearer token or session cookie", async () => {
    mocks.getAdminSessionCookie.mockReturnValue(undefined);

    await expect(
      authenticateAdmin(new Request("http://localhost/api/admin/services")),
    ).rejects.toMatchObject({ status: 401 });
  });
});
