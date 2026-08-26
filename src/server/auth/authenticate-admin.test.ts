import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminApp: vi.fn(),
  verifyIdToken: vi.fn(),
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({ verifyIdToken: mocks.verifyIdToken }),
}));

vi.mock("@/server/firebase/admin", () => ({
  getAdminApp: mocks.getAdminApp,
}));

import { AuthorizationError, authenticateAdmin } from "./admin-context";

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
    mocks.verifyIdToken.mockResolvedValue({ admin: true, salonId: "salon-1", uid: "user-1" });

    await expect(
      authenticateAdmin(
        new Request("http://localhost/api/admin/services", {
          headers: { Authorization: "Bearer valid-token" },
        }),
      ),
    ).resolves.toEqual({ salonId: "salon-1", userId: "user-1" });

    expect(mocks.verifyIdToken).toHaveBeenCalledWith("valid-token", true);
  });
});
