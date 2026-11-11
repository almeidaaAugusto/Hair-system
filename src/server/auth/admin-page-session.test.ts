import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  verifySessionCookie: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "admin_session" && mocks.cookie !== undefined
        ? { name, value: mocks.cookie }
        : undefined,
  }),
}));
vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({ verifySessionCookie: mocks.verifySessionCookie }),
}));
vi.mock("@/server/firebase/admin", () => ({ getAdminApp: vi.fn() }));

import { getOptionalAdminSession, requireAdminSession } from "./admin-page-session";

describe("administrative page session", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.cookie = "session-cookie";
    mocks.verifySessionCookie.mockResolvedValue({ admin: true, salonId: "salon-1", uid: "user-1" });
  });

  it("returns only the verified administrative context", async () => {
    await expect(requireAdminSession()).resolves.toEqual({ salonId: "salon-1", userId: "user-1" });
    expect(mocks.verifySessionCookie).toHaveBeenCalledWith("session-cookie", true);
    await expect(getOptionalAdminSession()).resolves.toEqual({
      salonId: "salon-1",
      userId: "user-1",
    });
  });

  it.each([undefined, ""])(
    "redirects a missing or empty cookie (%s) without calling Firebase",
    async (cookie) => {
      mocks.cookie = cookie;
      await expect(requireAdminSession()).rejects.toMatchObject({
        digest: "NEXT_REDIRECT;replace;/login;307;",
      });
      await expect(getOptionalAdminSession()).resolves.toBeNull();
      expect(mocks.verifySessionCookie).not.toHaveBeenCalled();
    },
  );

  it.each(["auth/argument-error", "auth/session-cookie-expired", "auth/session-cookie-revoked"])(
    "rejects %s and allows login to render without redirecting",
    async (code) => {
      mocks.verifySessionCookie.mockRejectedValue(
        Object.assign(new Error("private provider details"), { code }),
      );
      await expect(requireAdminSession()).rejects.toMatchObject({
        digest: "NEXT_REDIRECT;replace;/login;307;",
      });
      await expect(getOptionalAdminSession()).resolves.toBeNull();
    },
  );

  it.each([
    { admin: false, salonId: "salon-1", uid: "user-1" },
    { admin: true, uid: "user-1" },
    { admin: true, salonId: "  ", uid: "user-1" },
  ])("rejects insufficient administrative claims %j", async (claims) => {
    mocks.verifySessionCookie.mockResolvedValue(claims);
    await expect(requireAdminSession()).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;replace;/login;307;",
    });
    await expect(getOptionalAdminSession()).resolves.toBeNull();
  });

  it("propagates unexpected infrastructure failures instead of treating them as logout", async () => {
    const failure = new Error("service unavailable");
    mocks.verifySessionCookie.mockRejectedValue(failure);
    await expect(requireAdminSession()).rejects.toBe(failure);
    await expect(getOptionalAdminSession()).rejects.toBe(failure);
  });
});
