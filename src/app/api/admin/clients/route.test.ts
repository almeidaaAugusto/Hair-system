import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  log: vi.fn(),
  clients: {
    list: vi.fn(),
    findByPhone: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    addChemicalEntry: vi.fn(),
    removeChemicalEntry: vi.fn(),
  },
  appointments: { listByClient: vi.fn() },
}));
vi.mock("@/server/auth/admin-context", async (original) => ({
  ...(await original<typeof import("@/server/auth/admin-context")>()),
  authenticateAdmin: m.auth,
}));
vi.mock("@/server/clients/firestore-clients-repository", () => ({
  createFirestoreClientsRepository: () => m.clients,
}));
vi.mock("@/server/appointments/firestore-appointments-repository", () => ({
  createFirestoreAppointmentsRepository: () => m.appointments,
}));
vi.mock("@/server/observability/log-unexpected-server-error", () => ({
  logUnexpectedServerError: m.log,
}));

import { ClientRuleError } from "@/domain/clients/client";
import { AuthorizationError } from "@/server/auth/admin-context";
import { GET, POST } from "./route";
import { GET as lookup } from "./lookup/route";
import { GET as detail, PATCH } from "./[clientId]/route";
import { POST as addEntry } from "./[clientId]/chemical-history/route";
import { DELETE as removeEntry } from "./[clientId]/chemical-history/[entryId]/route";

const requestId = "123e4567-e89b-42d3-a456-426614174000";
const json = (method: string, url: string, body?: unknown) =>
  new Request(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

describe("administrative client HTTP API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.auth.mockResolvedValue({ salonId: "salon", userId: "admin" });
  });

  it("requires authentication on every route before touching data", async () => {
    m.auth.mockRejectedValue(new AuthorizationError("unauthorized", 401));
    const responses = await Promise.all([
      GET(json("GET", "/api/admin/clients")),
      POST(json("POST", "/api/admin/clients", {})),
      lookup(json("GET", "/api/admin/clients/lookup?phone=11999991234")),
      detail(json("GET", "/x"), params({ clientId: "c1" })),
      PATCH(json("PATCH", "/x", {}), params({ clientId: "c1" })),
      addEntry(json("POST", "/x", {}), params({ clientId: "c1" })),
      removeEntry(json("DELETE", "/x"), params({ clientId: "c1", entryId: "e1" })),
    ]);
    expect(responses.map((r) => r.status)).toEqual(Array(7).fill(401));
    expect(responses[0].headers.get("cache-control")).toBe("no-store");
    for (const repo of Object.values(m.clients)) expect(repo).not.toHaveBeenCalled();
  });

  it("lists clients of the authenticated salon", async () => {
    m.clients.list.mockResolvedValue([{ id: "c1", name: "Ana", phone: "5511999991234" }]);
    const response = await GET(json("GET", "/api/admin/clients"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      clients: [{ id: "c1", name: "Ana", phone: "5511999991234" }],
    });
    expect(m.clients.list).toHaveBeenCalledWith("salon");
  });

  it("creates a client with 201 and a replay with 200", async () => {
    const body = { requestId, name: "Ana", phone: "(11) 99999-1234" };
    m.clients.create.mockResolvedValueOnce({ client: { id: "c1" }, replayed: false });
    m.clients.create.mockResolvedValueOnce({ client: { id: "c1" }, replayed: true });
    expect((await POST(json("POST", "/x", body))).status).toBe(201);
    expect((await POST(json("POST", "/x", body))).status).toBe(200);
    expect(m.clients.create).toHaveBeenCalledWith("salon", "admin", {
      requestId,
      name: "Ana",
      phone: "5511999991234",
    });
  });

  it("returns 409 with the existing clientId when the phone is taken", async () => {
    m.clients.create.mockRejectedValue(
      new ClientRuleError("CLIENT_PHONE_TAKEN", "Já existe uma cliente com este telefone.", "c9"),
    );
    const response = await POST(
      json("POST", "/x", { requestId, name: "Ana", phone: "11999991234" }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Já existe uma cliente com este telefone.",
      code: "CLIENT_PHONE_TAKEN",
      clientId: "c9",
    });
  });

  it.each([
    { requestId, name: "", phone: "11999991234" },
    { requestId, name: "Ana", phone: "12" },
    { requestId, name: "Ana", phone: "11999991234", salonId: "evil" },
  ])("rejects invalid creation %j with 422", async (body) => {
    expect((await POST(json("POST", "/x", body))).status).toBe(422);
    expect(m.clients.create).not.toHaveBeenCalled();
  });

  it("looks up by phone in any format, 404 when absent, 422 when invalid", async () => {
    m.clients.findByPhone.mockResolvedValueOnce({
      id: "c1",
      name: "Ana",
      phone: "5511999991234",
      notes: "private",
      chemicalHistory: [{ id: "e1" }],
    });
    const found = await lookup(
      json("GET", "/api/admin/clients/lookup?phone=%2B55%20(11)%2099999-1234"),
    );
    expect(found.status).toBe(200);
    expect(await found.json()).toEqual({ client: { id: "c1", name: "Ana" } });
    expect(m.clients.findByPhone).toHaveBeenCalledWith("salon", "5511999991234");
    m.clients.findByPhone.mockResolvedValueOnce(null);
    expect((await lookup(json("GET", "/x?phone=11999991234"))).status).toBe(404);
    expect((await lookup(json("GET", "/x?phone=12"))).status).toBe(422);
    expect((await lookup(json("GET", "/x"))).status).toBe(422);
  });

  it("returns the client with history and summary", async () => {
    m.clients.get.mockResolvedValue({ id: "c1", name: "Ana" });
    m.appointments.listByClient.mockResolvedValue([
      {
        status: "completed",
        startAt: "2026-10-01T12:00:00.000Z",
        payment: { finalPriceCents: 8000, paidCents: 5000, method: "pix" },
      },
    ]);
    const response = await detail(json("GET", "/x"), params({ clientId: "c1" }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.client).toEqual({ id: "c1", name: "Ana" });
    expect(body.appointments).toHaveLength(1);
    expect(body.summary).toMatchObject({
      completedCount: 1,
      totalPaidCents: 5000,
      totalOutstandingCents: 3000,
    });
    expect(m.appointments.listByClient).toHaveBeenCalledWith("salon", "c1");
  });

  it("maps a missing client to 404 and hides unexpected errors", async () => {
    m.clients.get.mockRejectedValueOnce(new ClientRuleError("NOT_FOUND", "x"));
    expect((await detail(json("GET", "/x"), params({ clientId: "nope" }))).status).toBe(404);
    m.clients.get.mockRejectedValueOnce(new Error("boom 11999991234"));
    const failure = await detail(json("GET", "/x"), params({ clientId: "c1" }));
    expect(failure.status).toBe(500);
    expect(JSON.stringify(await failure.json())).not.toContain("11999991234");
  });

  it("patches partially, accepting null to clear but not for name or phone", async () => {
    m.clients.update.mockResolvedValue({ id: "c1" });
    const ok = await PATCH(
      json("PATCH", "/x", { instagram: null, notes: "n" }),
      params({ clientId: "c1" }),
    );
    expect(ok.status).toBe(200);
    expect(m.clients.update).toHaveBeenCalledWith("salon", "admin", "c1", {
      instagram: null,
      notes: "n",
    });
    for (const body of [{ name: null }, { phone: null }, {}]) {
      const bad = await PATCH(json("PATCH", "/x", body), params({ clientId: "c1" }));
      expect(bad.status).toBe(422);
    }
    m.clients.update.mockRejectedValue(new ClientRuleError("CLIENT_PHONE_TAKEN", "m", "c2"));
    const taken = await PATCH(
      json("PATCH", "/x", { phone: "11999991234" }),
      params({ clientId: "c1" }),
    );
    expect(taken.status).toBe(409);
    expect(await taken.json()).toMatchObject({ code: "CLIENT_PHONE_TAKEN", clientId: "c2" });
  });

  it("adds and removes chemical history entries", async () => {
    m.clients.addChemicalEntry.mockResolvedValue({
      client: {},
      entry: { id: "e1" },
      replayed: false,
    });
    const added = await addEntry(
      json("POST", "/x", { requestId, localDate: "2026-11-01", procedure: "Progressiva" }),
      params({ clientId: "c1" }),
    );
    expect(added.status).toBe(201);
    const invalid = await addEntry(
      json("POST", "/x", { requestId, localDate: "2026-02-30", procedure: "P" }),
      params({ clientId: "c1" }),
    );
    expect(invalid.status).toBe(422);
    m.clients.removeChemicalEntry.mockResolvedValue({ id: "c1", chemicalHistory: [] });
    const removed = await removeEntry(
      json("DELETE", "/x"),
      params({ clientId: "c1", entryId: "e1" }),
    );
    expect(removed.status).toBe(200);
    expect(m.clients.removeChemicalEntry).toHaveBeenCalledWith("salon", "admin", "c1", "e1");
  });
});
