import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSessionCookie: vi.fn(),
  getAdminApp: vi.fn(),
  verifySessionCookie: vi.fn(),
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({
    createSessionCookie: mocks.createSessionCookie,
    verifySessionCookie: mocks.verifySessionCookie,
  }),
}));

vi.mock("@/server/firebase/admin", () => ({
  getAdminApp: mocks.getAdminApp,
}));

import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminSessionCookie,
  getAdminSessionCookie,
  getAdminSessionCookieOptions,
  verifyAdminSessionCookie,
} from "./admin-session";
import { AuthorizationError } from "./admin-context";

describe("admin session", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("verifies a session cookie with revocation checking", async () => {
    mocks.verifySessionCookie.mockResolvedValue({
      admin: true,
      salonId: "salon-1",
      uid: "user-1",
    });

    await expect(verifyAdminSessionCookie("session-cookie")).resolves.toEqual({
      salonId: "salon-1",
      userId: "user-1",
    });
    expect(mocks.verifySessionCookie).toHaveBeenCalledWith("session-cookie", true);
  });

  it("maps an invalid Firebase session cookie to a safe 401 authorization error", async () => {
    mocks.verifySessionCookie.mockRejectedValue(
      Object.assign(new Error("session expired"), { code: "auth/session-cookie-expired" }),
    );

    const error = await verifyAdminSessionCookie("expired-session").catch(
      (error: unknown) => error,
    );

    expect(error).toBeInstanceOf(AuthorizationError);
    expect(error).toMatchObject({
      message: "Token de autenticação inválido.",
      status: 401,
    });
    expect((error as Error).message).not.toContain("session expired");
  });

  it("rejects session claims without administration", async () => {
    mocks.verifySessionCookie.mockResolvedValue({ admin: false, uid: "user-1" });

    await expect(verifyAdminSessionCookie("non-admin-session")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("rejects an administrative session claim without a salon", async () => {
    mocks.verifySessionCookie.mockResolvedValue({ admin: true, salonId: undefined, uid: "user-1" });

    await expect(verifyAdminSessionCookie("missing-salon-session")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("creates a five-day Firebase session cookie", async () => {
    mocks.createSessionCookie.mockResolvedValue("session-cookie");

    await expect(createAdminSessionCookie("id-token")).resolves.toBe("session-cookie");
    expect(mocks.createSessionCookie).toHaveBeenCalledWith("id-token", {
      expiresIn: 5 * 24 * 60 * 60 * 1000,
    });
  });

  it("reads only the named session cookie from a Cookie header", () => {
    const request = new Request("http://localhost/api/admin/services", {
      headers: { Cookie: "theme=dark; admin_session=session=value; session=other" },
    });

    expect(ADMIN_SESSION_COOKIE_NAME).toBe("admin_session");
    expect(getAdminSessionCookie(request)).toBe("session=value");
  });

  it("returns no session for a missing or blank session cookie", () => {
    expect(getAdminSessionCookie(new Request("http://localhost"))).toBeUndefined();
    expect(
      getAdminSessionCookie(
        new Request("http://localhost", { headers: { Cookie: "admin_session=   " } }),
      ),
    ).toBeUndefined();
  });

  it("marks session cookies secure only in production", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(getAdminSessionCookieOptions()).toEqual({
      httpOnly: true,
      maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
      path: "/",
      sameSite: "lax",
      secure: false,
    });

    vi.stubEnv("NODE_ENV", "production");
    expect(getAdminSessionCookieOptions()).toMatchObject({ secure: true });
  });
});
