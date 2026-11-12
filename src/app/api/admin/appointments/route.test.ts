import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
const m = vi.hoisted(() => ({
  auth: vi.fn(),
  factory: vi.fn(),
  log: vi.fn(),
  repo: {
    getDay: vi.fn(),
    getAvailability: vi.fn(),
    reserve: vi.fn(),
    cancel: vi.fn(),
    createBlock: vi.fn(),
    cancelBlock: vi.fn(),
  },
}));
vi.mock("@/server/auth/admin-context", async (original) => ({
  ...(await original<typeof import("@/server/auth/admin-context")>()),
  authenticateAdmin: m.auth,
}));
vi.mock("@/server/appointments/firestore-appointments-repository", () => ({
  createFirestoreAppointmentsRepository: m.factory,
}));
vi.mock("@/server/observability/log-unexpected-server-error", () => ({
  logUnexpectedServerError: m.log,
}));
import { AuthorizationError } from "@/server/auth/admin-context";
import { AppointmentRuleError } from "@/domain/appointments/appointment";
import { GET, POST } from "./route";
import { GET as availability } from "./availability/route";
import { POST as cancel } from "./[appointmentId]/cancel/route";
import { POST as block } from "../time-blocks/route";
import { POST as cancelBlock } from "../time-blocks/[blockId]/cancel/route";
const input = {
  requestId: "123e4567-e89b-42d3-a456-426614174000",
  serviceId: "service",
  startAt: "2026-11-12T12:00:00Z",
  client: { name: "Ana", phone: "(11) 99999-9999" },
  source: "manual",
};
const blockInput = {
  requestId: input.requestId,
  startAt: input.startAt,
  endAt: "2026-11-12T13:00:00Z",
};
const req = (url: string, body?: unknown) =>
  new Request(
    `http://localhost${url}`,
    body === undefined
      ? {}
      : { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) },
  );
describe("administrative appointment HTTP API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.auth.mockResolvedValue({ salonId: "salon", userId: "admin" });
    m.factory.mockReturnValue(m.repo);
  });
  it("authenticates before malformed body", async () => {
    m.auth.mockRejectedValue(new AuthorizationError("unauthorized", 401));
    const r = await POST(req("/x", "{"));
    expect(r.status).toBe(401);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(m.factory).not.toHaveBeenCalled();
  });
  it("authenticates every operation before parsing or accessing data", async () => {
    m.auth.mockRejectedValue(new AuthorizationError("forbidden", 403));
    const calls = [
      () => GET(req("/x?bad=value")),
      () => POST(req("/x", "{")),
      () => availability(req("/x?bad=value")),
      () => cancel(req("/x"), { params: Promise.resolve({ appointmentId: "bad/id" }) }),
      () => block(req("/x", "{")),
      () => cancelBlock(req("/x"), { params: Promise.resolve({ blockId: "bad/id" }) }),
    ];
    for (const call of calls) {
      const response = await call();
      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(m.factory).not.toHaveBeenCalled();
  });
  it("scopes day and availability to verified salon", async () => {
    m.repo.getDay.mockResolvedValue({ appointments: [] });
    m.repo.getAvailability.mockResolvedValue({ windows: [] });
    expect((await GET(req("/x?date=2026-11-12"))).status).toBe(200);
    expect(m.repo.getDay).toHaveBeenCalledWith("salon", "2026-11-12");
    expect((await availability(req("/x?date=2026-11-12&serviceId=service"))).status).toBe(200);
    expect(m.repo.getAvailability).toHaveBeenCalledWith("salon", {
      date: "2026-11-12",
      serviceId: "service",
    });
  });
  it("rejects duplicate or unknown query before access", async () => {
    for (const q of ["date=2026-11-12&date=2026-11-12", "date=2026-11-12&salonId=other"])
      expect((await GET(req(`/x?${q}`))).status).toBe(422);
    expect(m.factory).not.toHaveBeenCalled();
  });
  it("rejects invalid availability queries before accessing the repository", async () => {
    for (const query of [
      "date=2026-11-12&serviceId=service&serviceId=other",
      "date=2026-11-12&serviceId=service&salonId=other",
      "date=2026-11-12",
      "date=2026-02-30&serviceId=service",
    ]) {
      const response = await availability(req(`/x?${query}`));
      expect(response.status).toBe(422);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(m.factory).not.toHaveBeenCalled();
  });
  it("rejects malformed and forged block input before accessing the repository", async () => {
    expect((await block(req("/x", "{"))).status).toBe(400);
    expect((await block(req("/x", { ...blockInput, salonId: "other" }))).status).toBe(422);
    expect((await block(req("/x", { ...blockInput, startAt: "invalid" }))).status).toBe(422);
    expect(m.factory).not.toHaveBeenCalled();
  });
  it("rejects invalid block cancellation IDs before accessing the repository", async () => {
    const response = await cancelBlock(req("/x"), {
      params: Promise.resolve({ blockId: "bad/id" }),
    });
    expect(response.status).toBe(422);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(m.factory).not.toHaveBeenCalled();
  });
  it("creates and replays appointments using verified identity", async () => {
    m.repo.reserve
      .mockResolvedValueOnce({ appointment: { id: "a" }, replayed: false })
      .mockResolvedValueOnce({ appointment: { id: "a" }, replayed: true });
    expect((await POST(req("/x", input))).status).toBe(201);
    expect(m.repo.reserve).toHaveBeenCalledWith(
      "salon",
      "admin",
      expect.objectContaining({ client: { name: "Ana", phone: "11999999999" } }),
    );
    expect((await POST(req("/x", { ...input, source: "whatsapp" }))).status).toBe(200);
  });
  it("rejects malformed JSON and forged fields", async () => {
    expect((await POST(req("/x", "{"))).status).toBe(400);
    expect((await POST(req("/x", { ...input, salonId: "other" }))).status).toBe(422);
    expect(m.factory).not.toHaveBeenCalled();
  });
  it("creates and cancels blocks and cancels appointments", async () => {
    m.repo.createBlock
      .mockResolvedValueOnce({ timeBlock: {}, replayed: false })
      .mockResolvedValueOnce({ timeBlock: {}, replayed: true });
    m.repo.cancel.mockResolvedValue({});
    m.repo.cancelBlock.mockResolvedValue({});
    expect((await block(req("/x", blockInput))).status).toBe(201);
    expect((await block(req("/x", blockInput))).status).toBe(200);
    expect(m.repo.createBlock).toHaveBeenCalledWith(
      "salon",
      "admin",
      expect.objectContaining({ requestId: input.requestId }),
    );
    expect(
      (await cancel(req("/x"), { params: Promise.resolve({ appointmentId: "a" }) })).status,
    ).toBe(200);
    expect(m.repo.cancel).toHaveBeenCalledWith("salon", "admin", "a");
    expect(
      (await cancelBlock(req("/x"), { params: Promise.resolve({ blockId: "b" }) })).status,
    ).toBe(200);
    expect(m.repo.cancelBlock).toHaveBeenCalledWith("salon", "admin", "b");
    expect(
      (await cancel(req("/x"), { params: Promise.resolve({ appointmentId: "bad/id" }) })).status,
    ).toBe(422);
  });
  it.each([
    ["NOT_FOUND", 404],
    ["INVALID_TIME_RANGE", 422],
    ["SERVICE_UNAVAILABLE", 409],
    ["OUTSIDE_BUSINESS_HOURS", 409],
    ["CONFLICT", 409],
    ["IDEMPOTENCY_CONFLICT", 409],
  ] as const)("maps %s to %i", async (code, status) => {
    m.repo.reserve.mockRejectedValue(new AppointmentRuleError(code, "private content"));
    const r = await POST(req("/x", input));
    expect(r.status).toBe(status);
    expect(await r.text()).not.toContain("private content");
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
  it.each([new SyntaxError("secret"), new z.ZodError([]), new Error("secret")])(
    "keeps internal errors generic",
    async (error) => {
      m.repo.getDay.mockRejectedValue(error);
      const r = await GET(req("/x?date=2026-11-12"));
      expect(r.status).toBe(500);
      expect(await r.text()).not.toContain("secret");
      expect(m.log).toHaveBeenCalled();
    },
  );
});
