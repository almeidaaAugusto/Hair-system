import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(),
  createRepository: vi.fn(),
  getBusinessHoursConfiguration: vi.fn(),
  updateBusinessHours: vi.fn(),
}));

vi.mock("@/server/auth/admin-context", () => {
  class MockAuthorizationError extends Error {
    constructor(
      message: string,
      readonly status: 401 | 403,
    ) {
      super(message);
    }
  }

  return {
    AuthorizationError: MockAuthorizationError,
    authenticateAdmin: mocks.authenticateAdmin,
  };
});

vi.mock("@/server/business-hours/business-hours-repository", () => ({
  createFirestoreBusinessHoursRepository: mocks.createRepository,
}));

vi.mock("@/server/business-hours/configure-business-hours", () => ({
  getBusinessHoursConfiguration: mocks.getBusinessHoursConfiguration,
  updateBusinessHours: mocks.updateBusinessHours,
}));

import { AuthorizationError } from "@/server/auth/admin-context";

import { GET, PUT } from "./route";

describe("business hours administration route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("nega leitura sem uma identidade administrativa", async () => {
    mocks.authenticateAdmin.mockRejectedValue(
      new AuthorizationError("Token de autenticação ausente.", 401),
    );

    const response = await GET(new Request("http://localhost/api/admin/business-hours"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Token de autenticação ausente." });
  });

  it("nega atualização sem uma identidade administrativa", async () => {
    mocks.authenticateAdmin.mockRejectedValue(
      new AuthorizationError("Acesso administrativo não autorizado.", 403),
    );

    const response = await PUT(
      new Request("http://localhost/api/admin/business-hours", {
        method: "PUT",
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.updateBusinessHours).not.toHaveBeenCalled();
  });
});
