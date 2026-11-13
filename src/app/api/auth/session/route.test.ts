import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminSessionCookie: vi.fn(),
  logUnexpectedServerError: vi.fn(),
  revokeAdminSessions: vi.fn(),
  verifyAdminIdToken: vi.fn(),
  verifyIdToken: vi.fn(),
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({ verifyIdToken: mocks.verifyIdToken }),
}));
vi.mock("@/server/firebase/admin", () => ({ getAdminApp: vi.fn() }));

vi.mock("@/server/auth/admin-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/admin-context")>();
  return {
    ...actual,
    verifyAdminIdToken: mocks.verifyAdminIdToken,
  };
});

vi.mock("@/server/auth/admin-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/admin-session")>();
  return {
    ...actual,
    createAdminSessionCookie: mocks.createAdminSessionCookie,
    revokeAdminSessions: mocks.revokeAdminSessions,
  };
});

vi.mock("@/server/observability/log-unexpected-server-error", () => ({
  logUnexpectedServerError: mocks.logUnexpectedServerError,
}));

import { AuthorizationError } from "@/server/auth/admin-context";

import { DELETE, POST } from "./route";

const admin = { salonId: "salon-1", userId: "admin-1" };

function sameOriginBearerRequest(): Request {
  return new Request("http://localhost/api/auth/session", {
    method: "POST",
    headers: {
      Authorization: "Bearer firebase-id-token",
      Origin: "http://localhost",
    },
  });
}

function sameOriginRequestWithCookie(): Request {
  return new Request("http://localhost/api/auth/session", {
    method: "DELETE",
    headers: {
      Cookie: "admin_session=possibly-invalid-session",
      Origin: "http://localhost",
    },
  });
}

describe("administrative session route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each([
    ["POST", POST, 401],
    ["DELETE", DELETE, 204],
  ] as const)(
    "uses the received Host for %s when Next's internal URL has a different hostname",
    async (method, handler, expectedStatus) => {
      const response = await handler(
        new Request("http://localhost:3101/api/auth/session", {
          method,
          headers: { Host: "127.0.0.1:3101", Origin: "http://127.0.0.1:3101" },
        }),
      );

      expect(response.status).toBe(expectedStatus);
      expect(response.headers.get("cache-control")).toBe("no-store");
      if (method === "POST") {
        expect(response.headers.get("set-cookie")).toBeNull();
        await expect(response.json()).resolves.toEqual({ error: "Token de autenticação ausente." });
      } else {
        expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
      }
    },
  );

  it.each([
    ["POST", POST],
    ["DELETE", DELETE],
  ] as const)("rejects foreign origins against the actual Host on %s", async (method, handler) => {
    for (const origin of [
      "http://localhost:3101",
      "https://attacker.example",
      "https://127.0.0.1:3101",
    ]) {
      const response = await handler(
        new Request("http://localhost:3101/api/auth/session", {
          method,
          headers: {
            Host: "127.0.0.1:3101",
            Origin: origin,
            Authorization: "Bearer firebase-id-token",
          },
        }),
      );

      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("set-cookie")).toBeNull();
      await expect(response.json()).resolves.toEqual({
        error: "Requisição de sessão não autorizada.",
      });
    }
    expect(mocks.verifyAdminIdToken).not.toHaveBeenCalled();
    expect(mocks.createAdminSessionCookie).not.toHaveBeenCalled();
  });

  it.each([
    ["POST", POST, 401],
    ["DELETE", DELETE, 204],
  ] as const)(
    "ignores forwarded host headers for the %s same-origin decision",
    async (method, handler, expectedStatus) => {
      const headers = new Headers({
        Host: "127.0.0.1:3101",
        Origin: "http://127.0.0.1:3101",
        "X-Forwarded-Host": "attacker.example",
        "X-Forwarded-Proto": "https",
        Forwarded: "host=attacker.example;proto=https",
      });
      const accepted = await handler(
        new Request("http://localhost:3101/api/auth/session", { method, headers }),
      );
      expect(accepted.status).toBe(expectedStatus);
      expect(accepted.headers.get("cache-control")).toBe("no-store");

      headers.set("Origin", "https://attacker.example");
      const rejected = await handler(
        new Request("http://localhost:3101/api/auth/session", { method, headers }),
      );
      expect(rejected.status).toBe(403);
      expect(rejected.headers.get("set-cookie")).toBeNull();
      expect(rejected.headers.get("cache-control")).toBe("no-store");
    },
  );

  it("sets only an HttpOnly administrative cookie after a recent authorized login", async () => {
    mocks.verifyAdminIdToken.mockResolvedValue({
      admin,
      authTime: Math.floor(Date.now() / 1000),
    });
    mocks.createAdminSessionCookie.mockResolvedValue("signed-session");

    const response = await POST(sameOriginBearerRequest());

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toContain("admin_session=signed-session");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Path=/");
    expect(response.headers.get("set-cookie")).toMatch(/SameSite=Lax/i);
  });

  it("does not set a cookie when the verifier rejects a non-admin claim", async () => {
    mocks.verifyAdminIdToken.mockRejectedValue(
      new AuthorizationError("Acesso administrativo não autorizado.", 403),
    );

    const response = await POST(sameOriginBearerRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Acesso administrativo não autorizado.",
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("does not set a cookie when the verifier rejects a missing salon claim", async () => {
    mocks.verifyAdminIdToken.mockRejectedValue(
      new AuthorizationError("Acesso administrativo não autorizado.", 403),
    );

    const response = await POST(sameOriginBearerRequest());

    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects an ID token whose auth_time is older than five minutes", async () => {
    mocks.verifyAdminIdToken.mockResolvedValue({
      admin,
      authTime: Math.floor(Date.now() / 1000) - 301,
    });

    const response = await POST(sameOriginBearerRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Não foi possível iniciar a sessão." });
    expect(mocks.createAdminSessionCookie).not.toHaveBeenCalled();
  });

  it("rejects an ID token without auth_time", async () => {
    mocks.verifyAdminIdToken.mockResolvedValue({ admin, authTime: undefined });

    const response = await POST(sameOriginBearerRequest());

    expect(response.status).toBe(401);
    expect(mocks.createAdminSessionCookie).not.toHaveBeenCalled();
  });

  it("rejects a missing or malformed bearer token without creating a cookie", async () => {
    const missingAuthorization = await POST(
      new Request("http://localhost/api/auth/session", {
        method: "POST",
        headers: { Origin: "http://localhost" },
      }),
    );
    const malformedAuthorization = await POST(
      new Request("http://localhost/api/auth/session", {
        method: "POST",
        headers: { Authorization: "Basic firebase-id-token", Origin: "http://localhost" },
      }),
    );

    expect(missingAuthorization.status).toBe(401);
    expect(malformedAuthorization.status).toBe(401);
    await expect(missingAuthorization.json()).resolves.toEqual({
      error: "Token de autenticação ausente.",
    });
    await expect(malformedAuthorization.json()).resolves.toEqual({
      error: "Token de autenticação ausente.",
    });
    expect(missingAuthorization.headers.get("set-cookie")).toBeNull();
    expect(malformedAuthorization.headers.get("set-cookie")).toBeNull();
    expect(mocks.verifyAdminIdToken).not.toHaveBeenCalled();
    expect(mocks.createAdminSessionCookie).not.toHaveBeenCalled();
  });

  it.each([
    ["foreign", "https://attacker.example"],
    ["absent", undefined],
  ])("rejects a %s Origin before exchanging a session", async (_description, origin) => {
    const headers = new Headers({ Authorization: "Bearer firebase-id-token" });
    if (origin) headers.set("Origin", origin);

    const response = await POST(
      new Request("http://localhost/api/auth/session", { method: "POST", headers }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Requisição de sessão não autorizada.",
    });
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.verifyAdminIdToken).not.toHaveBeenCalled();
  });

  it("returns a generic 500 and logs an unexpected verification failure", async () => {
    const unexpectedError = new Error("Firebase provider diagnostics must not leak");
    mocks.verifyAdminIdToken.mockRejectedValue(unexpectedError);

    const response = await POST(sameOriginBearerRequest());

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "Não foi possível concluir a operação.",
    });
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.logUnexpectedServerError).toHaveBeenCalledWith(
      "/api/auth/session",
      unexpectedError,
    );
  });

  it.each(["auth/internal-error", "auth/invalid-credential", "auth/insufficient-permission"])(
    "returns a bounded 500 without cookie mutations when the Firebase SDK rejects with %s",
    async (code) => {
      const actual = await vi.importActual<typeof import("@/server/auth/admin-context")>(
        "@/server/auth/admin-context",
      );
      mocks.verifyAdminIdToken.mockImplementation(actual.verifyAdminIdToken);
      const failure = Object.assign(new Error("private provider diagnostics"), { code });
      mocks.verifyIdToken.mockRejectedValue(failure);
      const request = sameOriginBearerRequest();
      request.headers.set("Cookie", "admin_session=existing-valid-session");

      const response = await POST(request);

      expect(response.status).toBe(500);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("set-cookie")).toBeNull();
      await expect(response.json()).resolves.toEqual({
        error: "Não foi possível concluir a operação.",
      });
      expect(mocks.createAdminSessionCookie).not.toHaveBeenCalled();
      expect(mocks.logUnexpectedServerError).toHaveBeenCalledWith("/api/auth/session", failure);
    },
  );

  it("clears the session cookie on same-origin logout even when its value is invalid", async () => {
    const response = await DELETE(sameOriginRequestWithCookie());

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toContain("admin_session=");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("set-cookie")).toContain("Path=/");
    expect(mocks.verifyAdminIdToken).not.toHaveBeenCalled();
  });

  it.each([
    ["foreign", "https://attacker.example"],
    ["absent", undefined],
  ])("rejects a %s Origin before deleting a session", async (_description, origin) => {
    const headers = new Headers({ Cookie: "admin_session=possibly-invalid-session" });
    if (origin) headers.set("Origin", origin);

    const response = await DELETE(
      new Request("http://localhost/api/auth/session", { method: "DELETE", headers }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("revokes the refresh tokens of a valid session cookie on logout and clears the cookie", async () => {
    mocks.revokeAdminSessions.mockResolvedValue(undefined);

    const response = await DELETE(sameOriginRequestWithCookie());

    expect(response.status).toBe(204);
    expect(mocks.revokeAdminSessions).toHaveBeenCalledWith("possibly-invalid-session");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("does not revoke anything when there is no cookie, but still clears it", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/auth/session", {
        method: "DELETE",
        headers: { Origin: "http://localhost" },
      }),
    );

    expect(response.status).toBe(204);
    expect(mocks.revokeAdminSessions).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("clears the cookie even when the cookie is invalid", async () => {
    mocks.revokeAdminSessions.mockRejectedValue(
      new AuthorizationError("Token de autenticação inválido.", 401),
    );

    const response = await DELETE(sameOriginRequestWithCookie());

    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(mocks.logUnexpectedServerError).not.toHaveBeenCalled();
  });

  it("clears the cookie and logs when revocation fails unexpectedly", async () => {
    const failure = new Error("provider outage");
    mocks.revokeAdminSessions.mockRejectedValue(failure);

    const response = await DELETE(sameOriginRequestWithCookie());

    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(mocks.logUnexpectedServerError).toHaveBeenCalledWith("/api/auth/session", failure);
  });

  it("does not revoke sessions for a foreign origin", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/auth/session", {
        method: "DELETE",
        headers: { Cookie: "admin_session=valid", Origin: "https://attacker.example" },
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.revokeAdminSessions).not.toHaveBeenCalled();
  });
});
