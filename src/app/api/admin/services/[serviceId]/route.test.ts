import { beforeEach, describe, expect, it, vi } from "vitest";

import { createServiceSchema } from "@/domain/services/service";

const mocks = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(),
  createRepository: vi.fn(),
  logUnexpectedServerError: vi.fn(),
  updateService: vi.fn(),
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

vi.mock("@/server/services/service-repository", () => {
  class MockServiceNotFoundError extends Error {}

  return {
    ServiceNotFoundError: MockServiceNotFoundError,
    createFirestoreServicesRepository: mocks.createRepository,
  };
});

vi.mock("@/server/services/create-service", () => ({
  updateService: mocks.updateService,
}));

vi.mock("@/server/observability/log-unexpected-server-error", () => ({
  logUnexpectedServerError: mocks.logUnexpectedServerError,
}));

import { AuthorizationError } from "@/server/auth/admin-context";
import { ServiceNotFoundError } from "@/server/services/service-repository";

import { PATCH } from "./route";

const admin = { salonId: "salon-1", userId: "admin-1" };
const input = {
  name: "Corte feminino",
  durationMinutes: 60,
  startingPriceCents: 8_500,
  hasVariablePrice: false,
  requiresEvaluation: false,
  isActive: true,
};

function routeContext(serviceId = "service-1") {
  return { params: Promise.resolve({ serviceId }) };
}

describe("services administration item route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects a non-admin update before invoking the service operation", async () => {
    mocks.authenticateAdmin.mockRejectedValue(new AuthorizationError("forbidden", 403));

    const response = await PATCH(
      new Request("http://localhost/api/admin/services/service-1", {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
      routeContext(),
    );

    expect(response.status).toBe(403);
    expect(mocks.updateService).not.toHaveBeenCalled();
  });

  it("updates a service with the identity-derived salon context", async () => {
    const repository = { marker: "repository" };
    const service = { id: "service-1", salonId: "salon-1", ...input };
    mocks.authenticateAdmin.mockResolvedValue(admin);
    mocks.createRepository.mockReturnValue(repository);
    mocks.updateService.mockResolvedValue(service);

    const response = await PATCH(
      new Request("http://localhost/api/admin/services/service-1", {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
      routeContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ service });
    expect(mocks.updateService).toHaveBeenCalledWith("service-1", input, admin, repository);
  });

  it("passes a status-only update without stale editable fields", async () => {
    const repository = { marker: "repository" };
    const service = { id: "service-1", salonId: "salon-1", ...input, isActive: false };
    mocks.authenticateAdmin.mockResolvedValue(admin);
    mocks.createRepository.mockReturnValue(repository);
    mocks.updateService.mockResolvedValue(service);

    const response = await PATCH(
      new Request("http://localhost/api/admin/services/service-1", {
        method: "PATCH",
        body: JSON.stringify({ isActive: false }),
      }),
      routeContext(),
    );

    expect(response.status).toBe(200);
    expect(mocks.updateService).toHaveBeenCalledWith(
      "service-1",
      { isActive: false },
      admin,
      repository,
    );
  });

  it("maps invalid edit data to 422", async () => {
    const invalid = createServiceSchema.safeParse({ ...input, durationMinutes: 0 });
    if (invalid.success) throw new Error("Expected invalid fixture to fail validation.");

    mocks.authenticateAdmin.mockResolvedValue(admin);
    mocks.updateService.mockRejectedValue(invalid.error);

    const response = await PATCH(
      new Request("http://localhost/api/admin/services/service-1", {
        method: "PATCH",
        body: JSON.stringify({ ...input, durationMinutes: 0 }),
      }),
      routeContext(),
    );

    expect(response.status).toBe(422);
  });

  it("rejects malformed JSON without invoking the update operation", async () => {
    mocks.authenticateAdmin.mockResolvedValue(admin);

    const response = await PATCH(
      new Request("http://localhost/api/admin/services/service-1", {
        method: "PATCH",
        body: "{",
      }),
      routeContext(),
    );

    expect(response.status).toBe(400);
    expect(mocks.updateService).not.toHaveBeenCalled();
  });

  it("does not reveal a cross-salon service through the update response", async () => {
    mocks.authenticateAdmin.mockResolvedValue(admin);
    mocks.updateService.mockRejectedValue(new ServiceNotFoundError());

    const response = await PATCH(
      new Request("http://localhost/api/admin/services/service-from-another-salon", {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
      routeContext("service-from-another-salon"),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: expect.any(String) });
  });

  it("returns a generic 500 and logs an unexpected update failure", async () => {
    const unexpectedError = new Error("internal detail");
    mocks.authenticateAdmin.mockRejectedValue(unexpectedError);

    const response = await PATCH(
      new Request("http://localhost/api/admin/services/service-1", {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
      routeContext(),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: expect.any(String) });
    expect(mocks.logUnexpectedServerError).toHaveBeenCalledWith(
      "/api/admin/services/[serviceId]",
      unexpectedError,
    );
  });
});
