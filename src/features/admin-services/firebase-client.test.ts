import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: { emulatorConfig: null },
  setPersistence: vi.fn(),
}));

vi.mock("firebase/app", () => ({
  getApp: vi.fn(() => ({})),
  getApps: vi.fn(() => [{}]),
  initializeApp: vi.fn(() => ({})),
}));

vi.mock("firebase/auth", () => ({
  connectAuthEmulator: vi.fn(),
  getAuth: vi.fn(() => mocks.auth),
  inMemoryPersistence: { type: "NONE" },
  setPersistence: mocks.setPersistence,
}));

describe("getSessionClientAuth", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.setPersistence.mockReset();
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "test-api-key");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "test.firebaseapp.com");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "test-project");
  });

  it("retries configuration after the cached promise rejects", async () => {
    mocks.setPersistence
      .mockRejectedValueOnce(new Error("persistence unavailable"))
      .mockResolvedValueOnce(undefined);
    const { getSessionClientAuth } = await import("./firebase-client");

    await expect(getSessionClientAuth()).rejects.toThrow("persistence unavailable");
    await expect(getSessionClientAuth()).resolves.toBe(mocks.auth);
    expect(mocks.setPersistence).toHaveBeenCalledTimes(2);
  });
});
