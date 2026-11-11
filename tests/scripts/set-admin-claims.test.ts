import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserByEmail: vi.fn(),
  setCustomUserClaims: vi.fn(),
  revokeRefreshTokens: vi.fn(),
}));

vi.mock("firebase-admin/app", () => ({
  applicationDefault: vi.fn(),
  getApps: () => [{ name: "claims-script-test" }],
  initializeApp: vi.fn(),
}));
vi.mock("firebase-admin/auth", () => ({ getAuth: () => mocks }));

const originalArgv = [...process.argv];
const scriptUrl = new URL("../../scripts/set-admin-claims.mjs", import.meta.url).href;

describe("administrative claim changes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.stubEnv("FIREBASE_PROJECT_ID", "demo-sistema-cabelo");
    process.argv = ["node", "set-admin-claims.mjs", "admin@example.test", "new-salon"];
    mocks.getUserByEmail.mockResolvedValue({
      uid: "admin-uid",
      customClaims: { salonId: "old-salon", otherRole: true },
    });
    mocks.setCustomUserClaims.mockResolvedValue(undefined);
    mocks.revokeRefreshTokens.mockResolvedValue(undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.argv = [...originalArgv];
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("revokes existing sessions after updating salon claims while retaining unrelated claims", async () => {
    await import(scriptUrl);
    expect(mocks.setCustomUserClaims).toHaveBeenCalledWith("admin-uid", {
      admin: true,
      salonId: "new-salon",
      otherRole: true,
    });
    expect(mocks.revokeRefreshTokens).toHaveBeenCalledWith("admin-uid");
    expect(mocks.setCustomUserClaims.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.revokeRefreshTokens.mock.invocationCallOrder[0],
    );
  });

  it("fails without reporting success if session revocation fails", async () => {
    mocks.revokeRefreshTokens.mockRejectedValue(new Error("revocation unavailable"));
    await expect(import(scriptUrl)).rejects.toThrow("revocation unavailable");
    expect(console.log).not.toHaveBeenCalled();
  });
});
