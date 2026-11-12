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

import AdminPage from "./admin/page";
import ServicesPage from "./admin/services/page";
import BusinessHoursPage from "./admin/business-hours/page";
import LoginPage from "./login/page";
import { AdminLoginPage } from "@/features/admin-auth/admin-login-page";
import { ServicesAdminPage } from "@/features/admin-services/services-admin-page";
import { BusinessHoursAdminPage } from "@/features/admin-business-hours/business-hours-admin-page";

describe("administrative server pages", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.cookie = undefined;
    mocks.verifySessionCookie.mockResolvedValue({ admin: true, salonId: "salon-1", uid: "user-1" });
  });

  it.each([AdminPage, ServicesPage, BusinessHoursPage])(
    "redirects before returning page content when no session exists (%s)",
    async (page) => {
      await expect(page()).rejects.toMatchObject({ digest: "NEXT_REDIRECT;replace;/login;307;" });
    },
  );

  it.each([ServicesPage, BusinessHoursPage])(
    "rejects a revoked session before returning feature content (%s)",
    async (page) => {
      mocks.cookie = "revoked-session";
      mocks.verifySessionCookie.mockRejectedValue(
        Object.assign(new Error("revoked"), { code: "auth/session-cookie-revoked" }),
      );
      await expect(page()).rejects.toMatchObject({ digest: "NEXT_REDIRECT;replace;/login;307;" });
    },
  );

  it("returns the existing administrative features only for a verified administrator", async () => {
    mocks.cookie = "valid-session";
    expect((await ServicesPage()).type).toBe(ServicesAdminPage);
    expect((await BusinessHoursPage()).type).toBe(BusinessHoursAdminPage);
  });

  it("redirects the administrative root to the agenda after successful verification", async () => {
    mocks.cookie = "valid-session";
    await expect(AdminPage()).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;replace;/admin/agenda;307;",
    });
  });

  it("redirects an already authorized login visitor to the agenda", async () => {
    mocks.cookie = "valid-session";
    await expect(
      LoginPage({ searchParams: Promise.resolve({ next: "/admin/business-hours" }) }),
    ).rejects.toMatchObject({ digest: "NEXT_REDIRECT;replace;/admin/agenda;307;" });
  });

  it("renders login with a safe return destination when there is no session", async () => {
    const page = await LoginPage({
      searchParams: Promise.resolve({ next: "/admin/business-hours?day=monday" }),
    });
    expect(page.type).toBe(AdminLoginPage);
    expect(page.props).toMatchObject({
      hasStaleSession: false,
      next: "/admin/business-hours?day=monday",
    });
  });

  it("renders stale-session cleanup instead of redirecting an invalid cookie back to admin", async () => {
    mocks.cookie = "stale-session";
    mocks.verifySessionCookie.mockRejectedValue(
      Object.assign(new Error("invalid"), { code: "auth/argument-error" }),
    );
    const page = await LoginPage({ searchParams: Promise.resolve({}) });
    expect(page.type).toBe(AdminLoginPage);
    expect(page.props).toMatchObject({ hasStaleSession: true, next: "/admin/agenda" });
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/admin/../../login",
    ["/admin/services", "https://evil.example"],
  ])("defaults an unsafe or ambiguous return destination %j", async (next) => {
    const page = await LoginPage({ searchParams: Promise.resolve({ next }) });
    expect(page.props.next).toBe("/admin/agenda");
  });
});
