import { beforeEach, describe, expect, it, vi } from "vitest";
import { createServiceSchema } from "@/domain/services/service";

const mocks = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(),
  createRepository: vi.fn(),
  createService: vi.fn(),
  listServices: vi.fn(),
  logUnexpectedServerError: vi.fn(),
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

vi.mock("@/server/services/service-repository", () => ({
  createFirestoreServicesRepository: mocks.createRepository,
}));

vi.mock("@/server/services/create-service", () => ({
  createService: mocks.createService,
  listServices: mocks.listServices,
}));

vi.mock("@/server/observability/log-unexpected-server-error", () => ({
  logUnexpectedServerError: mocks.logUnexpectedServerError,
}));

import { AuthorizationError } from "@/server/auth/admin-context";

import { GET, POST } from "./route";

const admin = { uid: "admin-1", salonId: "salon-1" };

describe("services administration collection route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("maps an unauthenticated collection read to 401", async () => {
    mocks.authenticateAdmin.mockRejectedValue(
      new AuthorizationError("Token de autenticação ausente.", 401),
    );

    const response = await GET(new Request("http://localhost/api/admin/services"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Token de autenticação ausente." });
  });

  it("maps a non-admin create attempt to 403 without creating a service", async () => {
    mocks.authenticateAdmin.mockRejectedValue(
      new AuthorizationError("Acesso administrativo não autorizado.", 403),
    );

    const response = await POST(
      new Request("http://localhost/api/admin/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Corte" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.createService).not.toHaveBeenCalled();
  });

  it("serializes a created service with 201", async () => {
    const createdService = {
      id: "service-1",
      salonId: "salon-1",
      name: "Corte feminino",
      durationMinutes: 60,
      startingPriceCents: 8500,
      hasVariablePrice: false,
      requiresEvaluation: false,
      isActive: true,
    };
    mocks.authenticateAdmin.mockResolvedValue(admin);
    mocks.createService.mockResolvedValue(createdService);

    const response = await POST(
      new Request("http://localhost/api/admin/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Corte feminino",
          durationMinutes: 60,
          startingPriceCents: 8500,
          hasVariablePrice: false,
          requiresEvaluation: false,
          isActive: true,
        }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ service: createdService });
  });

  it("maps invalid service data to 422", async () => {
    const parsed = createServiceSchema.safeParse({
      name: "",
      durationMinutes: 60,
      startingPriceCents: 8500,
      hasVariablePrice: false,
      requiresEvaluation: false,
      isActive: true,
    });
    if (parsed.success) throw new Error("Expected invalid service fixture to fail validation.");

    mocks.authenticateAdmin.mockResolvedValue(admin);
    mocks.createService.mockRejectedValue(parsed.error);

    const response = await POST(
      new Request("http://localhost/api/admin/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "Dados do serviço inválidos.",
      details: {
        formErrors: [],
        fieldErrors: { name: ["Informe o nome do serviço."] },
      },
    });
  });

  it("maps malformed JSON to 400", async () => {
    mocks.authenticateAdmin.mockResolvedValue(admin);

    const response = await POST(
      new Request("http://localhost/api/admin/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.createService).not.toHaveBeenCalled();
  });

  it("returns a generic 500 and logs an unexpected failure without leaking it", async () => {
    const unexpectedError = new Error("FIREBASE_SERVICE_ACCOUNT_JSON must stay private");
    mocks.authenticateAdmin.mockRejectedValue(unexpectedError);

    const response = await GET(new Request("http://localhost/api/admin/services"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Não foi possível concluir a operação.",
    });
    expect(mocks.logUnexpectedServerError).toHaveBeenCalledWith(
      "/api/admin/services",
      unexpectedError,
    );
  });

  it("rejects a non JSON content type with 415 and no-store", async () => {
    mocks.authenticateAdmin.mockResolvedValue(admin);

    const response = await POST(
      new Request("http://localhost/api/admin/services", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "{}",
      }),
    );

    expect(response.status).toBe(415);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.createService).not.toHaveBeenCalled();
  });

  it("sends no-store on reads and errors", async () => {
    mocks.authenticateAdmin.mockResolvedValue(admin);
    mocks.listServices.mockResolvedValue([]);

    const ok = await GET(new Request("http://localhost/api/admin/services"));
    expect(ok.headers.get("cache-control")).toBe("no-store");

    mocks.authenticateAdmin.mockRejectedValue(new AuthorizationError("x", 401));
    const denied = await GET(new Request("http://localhost/api/admin/services"));
    expect(denied.headers.get("cache-control")).toBe("no-store");
  });
});
