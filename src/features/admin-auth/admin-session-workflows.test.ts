import { describe, expect, it, vi } from "vitest";

import {
  clearAdminSession,
  finalizeSuccessfulAdminLogin,
  performAdminLogout,
} from "./admin-session-workflows";

describe("clearAdminSession", () => {
  it("reports a non-OK session deletion as a failure", async () => {
    const fetchSession = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 500 }));

    await expect(clearAdminSession(fetchSession)).resolves.toBe(false);
  });
});

describe("finalizeSuccessfulAdminLogin", () => {
  it("rolls back the server cookie and reports the rollback when a retry clears Firebase", async () => {
    const signOutClient = vi
      .fn<(auth: object) => Promise<void>>()
      .mockRejectedValueOnce(new Error("storage failure"))
      .mockResolvedValueOnce(undefined);
    const softNavigate = vi.fn();
    const hardNavigate = vi.fn();

    await expect(
      finalizeSuccessfulAdminLogin({
        auth: {},
        clearSession: vi.fn().mockResolvedValue(true),
        destination: "/admin/services",
        hardNavigate,
        signOutClient,
        softNavigate,
      }),
    ).resolves.toBe("rolled-back");
    expect(softNavigate).not.toHaveBeenCalled();
    expect(hardNavigate).not.toHaveBeenCalled();
  });

  it("hard-navigates to login when the cookie is cleared but Firebase cannot be discarded", async () => {
    const hardNavigate = vi.fn();

    await expect(
      finalizeSuccessfulAdminLogin({
        auth: {},
        clearSession: vi.fn().mockResolvedValue(true),
        destination: "/admin/services",
        hardNavigate,
        signOutClient: vi.fn().mockRejectedValue(new Error("storage failure")),
        softNavigate: vi.fn(),
      }),
    ).resolves.toBe("navigated");
    expect(hardNavigate).toHaveBeenCalledWith("/login");
  });

  it("hard-navigates to the protected destination when cookie rollback and Firebase cleanup fail", async () => {
    const hardNavigate = vi.fn();

    await expect(
      finalizeSuccessfulAdminLogin({
        auth: {},
        clearSession: vi.fn().mockResolvedValue(false),
        destination: "/admin/business-hours",
        hardNavigate,
        signOutClient: vi.fn().mockRejectedValue(new Error("storage failure")),
        softNavigate: vi.fn(),
      }),
    ).resolves.toBe("navigated");
    expect(hardNavigate).toHaveBeenCalledWith("/admin/business-hours");
  });
});

describe("performAdminLogout", () => {
  it("navigates after successful DELETE even when Firebase auth initialization fails", async () => {
    const navigate = vi.fn();

    await expect(
      performAdminLogout({
        clearSession: vi.fn().mockResolvedValue(true),
        getAuth: vi.fn().mockRejectedValue(new Error("configuration failure")),
        navigate,
        signOutClient: vi.fn(),
      }),
    ).resolves.toBe(true);
    expect(navigate).toHaveBeenCalledWith("/login");
  });

  it("stays on the protected screen when DELETE fails", async () => {
    const navigate = vi.fn();

    await expect(
      performAdminLogout({
        clearSession: vi.fn().mockResolvedValue(false),
        getAuth: vi.fn(),
        navigate,
        signOutClient: vi.fn(),
      }),
    ).resolves.toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});
