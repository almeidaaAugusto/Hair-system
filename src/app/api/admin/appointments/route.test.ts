import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
const m = vi.hoisted(() => ({
  auth: vi.fn(),
  factory: vi.fn(),
  log: vi.fn(),
  repo: {
    getDay: vi.fn(),
    getRange: vi.fn(),
    getAvailability: vi.fn(),
    reserve: vi.fn(),
    cancel: vi.fn(),
    complete: vi.fn(),
    markNoShow: vi.fn(),
    markReminderSent: vi.fn(),
    markClientConfirmed: vi.fn(),
    reschedule: vi.fn(),
    recordPayment: vi.fn(),
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
import { POST as complete } from "./[appointmentId]/complete/route";
import { POST as noShow } from "./[appointmentId]/no-show/route";
import { POST as payment } from "./[appointmentId]/payment/route";
import { POST as reschedule } from "./[appointmentId]/reschedule/route";
import { POST as reminderSent } from "./[appointmentId]/reminder-sent/route";
import { POST as clientConfirmation } from "./[appointmentId]/client-confirmation/route";
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
      : {
          method: "POST",
          body: typeof body === "string" ? body : JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
        },
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
      () => complete(req("/x", "{"), { params: Promise.resolve({ appointmentId: "bad/id" }) }),
      () => noShow(req("/x"), { params: Promise.resolve({ appointmentId: "bad/id" }) }),
      () => payment(req("/x", "{"), { params: Promise.resolve({ appointmentId: "bad/id" }) }),
      () => reschedule(req("/x", "{"), { params: Promise.resolve({ appointmentId: "bad/id" }) }),
      () => reminderSent(req("/x"), { params: Promise.resolve({ appointmentId: "bad/id" }) }),
      () => clientConfirmation(req("/x"), { params: Promise.resolve({ appointmentId: "bad/id" }) }),
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
  it("reads a local-date range for the verified salon, up to 42 days", async () => {
    m.repo.getRange.mockResolvedValue({ appointments: [], timeBlocks: [] });
    expect((await GET(req("/x?from=2026-11-09&to=2026-11-15"))).status).toBe(200);
    expect(m.repo.getRange).toHaveBeenCalledWith("salon", "2026-11-09", "2026-11-15");
    expect((await GET(req("/x?from=2026-10-26&to=2026-12-06"))).status).toBe(200);
    expect((await GET(req("/x?from=2026-11-12&to=2026-11-12"))).status).toBe(200);
    expect(m.repo.getDay).not.toHaveBeenCalled();
  });
  it("rejects inverted, oversized, partial or mixed ranges before access", async () => {
    for (const q of [
      "from=2026-11-15&to=2026-11-09",
      "from=2026-10-26&to=2026-12-07",
      "from=2026-11-09",
      "to=2026-11-09",
      "date=2026-11-12&from=2026-11-09&to=2026-11-15",
      "from=2026-11-09&to=2026-11-15&salonId=other",
      "from=2026-02-30&to=2026-03-02",
    ]) {
      const response = await GET(req(`/x?${q}`));
      expect(response.status).toBe(422);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(m.factory).not.toHaveBeenCalled();
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
  it("completes, marks no-show and records payment with the verified identity", async () => {
    const params = { params: Promise.resolve({ appointmentId: "a" }) };
    const paid = { finalPriceCents: 9500, paidCents: 9500, method: "pix" };
    m.repo.complete.mockResolvedValue({ id: "a", status: "completed" });
    m.repo.markNoShow.mockResolvedValue({ id: "a", status: "no_show" });
    m.repo.recordPayment.mockResolvedValue({ id: "a", payment: paid });
    const completed = await complete(req("/x", {}), params);
    expect(completed.status).toBe(200);
    expect(await completed.json()).toEqual({ appointment: { id: "a", status: "completed" } });
    expect(m.repo.complete).toHaveBeenCalledWith("salon", "admin", "a", {});
    expect((await complete(req("/x", { payment: paid }), params)).status).toBe(200);
    expect(m.repo.complete).toHaveBeenLastCalledWith("salon", "admin", "a", { payment: paid });
    expect((await noShow(req("/x"), params)).status).toBe(200);
    expect(m.repo.markNoShow).toHaveBeenCalledWith("salon", "admin", "a");
    const recorded = await payment(req("/x", paid), params);
    expect(recorded.status).toBe(200);
    expect(recorded.headers.get("cache-control")).toBe("no-store");
    expect(m.repo.recordPayment).toHaveBeenCalledWith("salon", "admin", "a", paid);
  });
  it("rejects malformed, forged or inconsistent attendance input before access", async () => {
    const params = { params: Promise.resolve({ appointmentId: "a" }) };
    expect((await complete(req("/x", "{"), params)).status).toBe(400);
    expect((await complete(req("/x", { status: "completed" }), params)).status).toBe(422);
    expect(
      (await complete(req("/x", { payment: { finalPriceCents: 1, paidCents: 2 } }), params)).status,
    ).toBe(422);
    for (const body of [
      { finalPriceCents: 100, paidCents: 101, method: "pix" },
      { finalPriceCents: 100, paidCents: 50 },
      { finalPriceCents: 10.5, paidCents: 0 },
      { finalPriceCents: 100, paidCents: 0, salonId: "other" },
      { finalPriceCents: 100, paidCents: 100, method: "boleto" },
    ])
      expect((await payment(req("/x", body), params)).status).toBe(422);
    expect((await payment(req("/x", "{"), params)).status).toBe(400);
    expect(
      (await noShow(req("/x"), { params: Promise.resolve({ appointmentId: "bad/id" }) })).status,
    ).toBe(422);
    expect(m.factory).not.toHaveBeenCalled();
  });
  it("reschedules, records reminders and client confirmation for the verified salon", async () => {
    const params = { params: Promise.resolve({ appointmentId: "a" }) };
    m.repo.reschedule.mockResolvedValue({ id: "a" });
    m.repo.markReminderSent.mockResolvedValue({ id: "a" });
    m.repo.markClientConfirmed.mockResolvedValue({ id: "a" });
    expect(
      (await reschedule(req("/x", { startAt: "2026-11-17T12:00:00Z", serviceId: "s" }), params))
        .status,
    ).toBe(200);
    expect(m.repo.reschedule).toHaveBeenCalledWith("salon", "admin", "a", {
      startAt: "2026-11-17T12:00:00.000Z",
      serviceId: "s",
    });
    expect((await reminderSent(req("/x"), params)).status).toBe(200);
    expect(m.repo.markReminderSent).toHaveBeenCalledWith("salon", "admin", "a");
    const confirmed = await clientConfirmation(req("/x"), params);
    expect(confirmed.status).toBe(200);
    expect(confirmed.headers.get("cache-control")).toBe("no-store");
    expect(m.repo.markClientConfirmed).toHaveBeenCalledWith("salon", "admin", "a");
  });
  it("rejects invalid reschedule input before access", async () => {
    const params = { params: Promise.resolve({ appointmentId: "a" }) };
    for (const body of [
      {},
      { startAt: "2026-11-17T12:00:30Z" },
      { startAt: "2026-11-17T12:00:00Z", salonId: "other" },
      { startAt: "2026-11-17T12:00:00Z", serviceId: "a/b" },
    ])
      expect((await reschedule(req("/x", body), params)).status).toBe(422);
    expect((await reschedule(req("/x", "{"), params)).status).toBe(400);
    expect(m.factory).not.toHaveBeenCalled();
  });
  it("passes the excluded appointment to availability", async () => {
    m.repo.getAvailability.mockResolvedValue({ windows: [] });
    const r = await availability(
      req("/x?date=2026-11-12&serviceId=service&excludeAppointmentId=a"),
    );
    expect(r.status).toBe(200);
    expect(m.repo.getAvailability).toHaveBeenCalledWith("salon", {
      date: "2026-11-12",
      serviceId: "service",
      excludeAppointmentId: "a",
    });
  });
  it.each(["INVALID_TRANSITION", "NOT_STARTED"] as const)(
    "maps attendance rule %s to 409 without private content",
    async (code) => {
      m.repo.markNoShow.mockRejectedValue(new AppointmentRuleError(code, "private content"));
      const r = await noShow(req("/x"), { params: Promise.resolve({ appointmentId: "a" }) });
      expect(r.status).toBe(409);
      expect(await r.json()).toEqual({ error: "Não foi possível concluir a operação.", code });
    },
  );
  it.each([
    ["NOT_FOUND", 404],
    ["INVALID_TIME_RANGE", 422],
    ["SERVICE_UNAVAILABLE", 409],
    ["SERVICE_INACTIVE", 409],
    ["SERVICE_REQUIRES_EVALUATION", 409],
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
  it.each(["OUTSIDE_BUSINESS_HOURS", "SERVICE_REQUIRES_EVALUATION"] as const)(
    "flags %s as overridable",
    async (code) => {
      m.repo.reserve.mockRejectedValue(new AppointmentRuleError(code, "private"));
      const r = await POST(req("/x", input));
      expect(r.status).toBe(409);
      expect(await r.json()).toEqual({
        error: "Não foi possível concluir a operação.",
        code,
        overridable: true,
      });
    },
  );
  it("never flags an inactive service as overridable", async () => {
    m.repo.reserve.mockRejectedValue(new AppointmentRuleError("SERVICE_INACTIVE", "private"));
    const r = await POST(req("/x", input));
    expect(await r.json()).toEqual({
      error: "Não foi possível concluir a operação.",
      code: "SERVICE_INACTIVE",
    });
  });
  it("passes allowExceptions to the repository and rejects non-boolean values", async () => {
    m.repo.reserve.mockResolvedValue({ appointment: { exceptions: [] }, replayed: false });
    await POST(req("/x", { ...input, allowExceptions: true }));
    expect(m.repo.reserve).toHaveBeenCalledWith(
      "salon",
      "admin",
      expect.objectContaining({ allowExceptions: true }),
    );
    expect((await POST(req("/x", { ...input, allowExceptions: "yes" }))).status).toBe(422);
    m.repo.reschedule.mockResolvedValue({ exceptions: [] });
    await reschedule(req("/x", { startAt: input.startAt, allowExceptions: true }), {
      params: Promise.resolve({ appointmentId: "a" }),
    });
    expect(m.repo.reschedule).toHaveBeenCalledWith(
      "salon",
      "admin",
      "a",
      expect.objectContaining({ allowExceptions: true }),
    );
  });
  it("requires a JSON content type on bodies", async () => {
    const r = await POST(
      new Request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify(input),
        headers: { "Content-Type": "text/plain" },
      }),
    );
    expect(r.status).toBe(415);
    expect(m.repo.reserve).not.toHaveBeenCalled();
  });
});
