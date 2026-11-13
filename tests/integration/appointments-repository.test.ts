import { generateKeyPairSync, randomUUID } from "node:crypto";
import { cert, deleteApp, initializeApp, type App } from "firebase-admin/app";
import {
  FieldValue,
  getFirestore,
  Timestamp,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDefaultBusinessHoursInput } from "@/domain/business-hours/business-hours";
import {
  type CreateAppointmentInput,
  type CreateTimeBlockInput,
} from "@/domain/appointments/appointment";
import { createFirestoreBusinessHoursRepository } from "@/server/business-hours/business-hours-repository";
import { createFirestoreAppointmentsRepository } from "@/server/appointments/firestore-appointments-repository";

const date = "2026-11-16";
const startAt = `${date}T12:00:00.000Z`;
const collections = [
  "services",
  "businessHours",
  "appointments",
  "timeBlocks",
  "appointmentDayLocks",
];
let app: App;
let firestore: Firestore;
let salonId: string;
let serviceId: string;
const salons: string[] = [];

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

type Trace = {
  attempts: string[][];
  writes: number;
  firstPath?: string;
  pendingReadsAtEnd: number[];
  readsBeforeGuardResolved: number;
};
// Delegate actual reads, writes, retry and commit to the Admin SDK. Gates only
// coordinate when commands enter the SDK; no fake commit or lock simulation.
function instrument(
  hooks: { beforeFirst?: () => Promise<void>; afterFirst?: () => Promise<void> } = {},
) {
  const trace: Trace = {
    attempts: [],
    writes: 0,
    pendingReadsAtEnd: [],
    readsBeforeGuardResolved: 0,
  };
  let firstAttempt = true;
  const facade = new Proxy(firestore, {
    get(target, property) {
      if (property === "runTransaction") {
        return (callback: (transaction: Transaction) => Promise<unknown>) =>
          target.runTransaction(async (transaction) => {
            const events: string[] = [];
            trace.attempts.push(events);
            let firstRead = true;
            let guardResolved = false;
            let pendingReads = 0;
            const wrapped = new Proxy(transaction, {
              get(tx, key) {
                const method = Reflect.get(tx, key, tx);
                if (key === "get")
                  return async (...args: unknown[]) => {
                    const path = (args[0] as { path?: string }).path ?? "query";
                    const isGuard = firstRead;
                    if (!isGuard && !guardResolved) trace.readsBeforeGuardResolved++;
                    const gated = firstRead && firstAttempt;
                    if (firstRead) trace.firstPath ??= path;
                    firstRead = false;
                    if (gated) {
                      firstAttempt = false;
                      await hooks.beforeFirst?.();
                    }
                    events.push(`read:${path}`);
                    pendingReads++;
                    try {
                      const result = await Reflect.apply(method, tx, args);
                      if (gated) await hooks.afterFirst?.();
                      if (isGuard) guardResolved = true;
                      return result;
                    } finally {
                      pendingReads--;
                    }
                  };
                if (["set", "create", "update", "delete"].includes(String(key)))
                  return (...args: unknown[]) => {
                    trace.writes++;
                    events.push("write");
                    return Reflect.apply(method, tx, args);
                  };
                return typeof method === "function" ? method.bind(tx) : method;
              },
            });
            try {
              return await callback(wrapped);
            } finally {
              trace.pendingReadsAtEnd.push(pendingReads);
            }
          });
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { repository: createFirestoreAppointmentsRepository(facade), trace };
}

function pair() {
  const ready = deferred();
  let arrivals = 0;
  const beforeFirst = async () => {
    if (++arrivals === 2) ready.resolve();
    await ready.promise;
  };
  return [instrument({ beforeFirst }), instrument({ beforeFirst })] as const;
}

function assertOrder(trace: Trace) {
  expect(trace.attempts.length).toBeGreaterThan(0);
  expect(trace.readsBeforeGuardResolved).toBe(0);
  expect(trace.pendingReadsAtEnd.every((pending) => pending === 0)).toBe(true);
  for (const events of trace.attempts) {
    expect(events[0].startsWith("read:appointmentDayLocks/")).toBe(true);
    const write = events.indexOf("write");
    if (write !== -1) expect(events.slice(write).every((event) => event === "write")).toBe(true);
  }
}

function input(overrides: Partial<CreateAppointmentInput> = {}): CreateAppointmentInput {
  return {
    requestId: randomUUID(),
    serviceId,
    startAt,
    client: { name: "Fixture", phone: "11999999999" },
    source: "manual",
    ...overrides,
  };
}
function block(overrides: Partial<CreateTimeBlockInput> = {}): CreateTimeBlockInput {
  return { requestId: randomUUID(), startAt, endAt: `${date}T13:00:00.000Z`, ...overrides };
}
function summary(results: PromiseSettledResult<unknown>[]) {
  return results
    .map((result) => (result.status === "fulfilled" ? "ok" : result.reason.code))
    .sort();
}
async function count(collection: string) {
  return (await firestore.collection(collection).where("salonId", "==", salonId).get()).size;
}

beforeAll(() => {
  if (
    process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8085" ||
    process.env.GCLOUD_PROJECT !== "demo-sistema-cabelo"
  ) {
    throw new Error("Appointments integration requires the local demo emulator.");
  }
  // Explicit throwaway credentials avoid ADC/metadata discovery. The emulator
  // guard above must run first; this key has no permissions in any real project.
  const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString();
  app = initializeApp(
    {
      projectId: "demo-sistema-cabelo",
      credential: cert({
        projectId: "demo-sistema-cabelo",
        clientEmail: "emulator-only@demo-sistema-cabelo.iam.gserviceaccount.com",
        privateKey,
      }),
    },
    `appointments-${randomUUID()}`,
  );
  firestore = getFirestore(app);
});
beforeEach(async () => {
  salonId = `integration-${randomUUID()}`;
  salons.push(salonId);
  serviceId = `service-${randomUUID()}`;
  await firestore.collection("services").doc(serviceId).set({
    salonId,
    name: "Corte",
    durationMinutes: 60,
    startingPriceCents: 5000,
    hasVariablePrice: false,
    requiresEvaluation: false,
    isActive: true,
  });
});
afterAll(async () => {
  if (!firestore) return;
  for (const salon of salons)
    for (const collection of collections) {
      const ownDocuments = await firestore
        .collection(collection)
        .where("salonId", "==", salon)
        .get();
      await Promise.all(ownDocuments.docs.map((document) => document.ref.delete()));
    }
  await firestore.terminate();
  await deleteApp(app);
}, 60_000);

describe("Firestore appointments transactions", { timeout: 30_000 }, () => {
  it("settles all transactional reads before rejecting a missing service", async () => {
    const { repository, trace } = instrument();
    await expect(
      repository.reserve(salonId, "admin", input({ serviceId: "missing" })),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(trace.pendingReadsAtEnd).toEqual([0]);
    expect(trace.writes).toBe(0);
  });

  it("reads an inclusive local-date range ordered by day and start, scoped by salon", async () => {
    const { repository } = instrument();
    const otherSalon = `integration-${randomUUID()}`;
    salons.push(otherSalon);
    const otherService = `service-${randomUUID()}`;
    await firestore.collection("services").doc(otherService).set({
      salonId: otherSalon,
      name: "Outro",
      durationMinutes: 30,
      startingPriceCents: 1000,
      hasVariablePrice: false,
      requiresEvaluation: false,
      isActive: true,
    });
    await repository.reserve(salonId, "admin", input({ startAt: "2026-11-17T12:00:00.000Z" }));
    await repository.reserve(salonId, "admin", input({ startAt: "2026-11-16T15:00:00.000Z" }));
    await repository.reserve(salonId, "admin", input());
    await repository.createBlock(
      salonId,
      "admin",
      block({ startAt: "2026-11-18T12:00:00.000Z", endAt: "2026-11-18T13:00:00.000Z" }),
    );
    await repository.reserve(otherSalon, "admin", input({ serviceId: otherService }));

    const twoDays = await repository.getRange(salonId, "2026-11-16", "2026-11-17");
    expect(twoDays).toMatchObject({ from: "2026-11-16", to: "2026-11-17" });
    expect(twoDays.appointments.map((record) => record.startAt)).toEqual([
      "2026-11-16T12:00:00.000Z",
      "2026-11-16T15:00:00.000Z",
      "2026-11-17T12:00:00.000Z",
    ]);
    expect(twoDays.timeBlocks).toEqual([]);
    const withBlock = await repository.getRange(salonId, "2026-11-16", "2026-11-18");
    expect(withBlock.timeBlocks.map((record) => record.localDate)).toEqual(["2026-11-18"]);
    expect(
      (await repository.getRange(otherSalon, "2026-11-16", "2026-11-18")).appointments,
    ).toHaveLength(1);
    await expect(repository.getRange(salonId, "2026-11-18", "2026-11-16")).rejects.toThrow();
  });

  it("allows exactly one competing reservation on the first empty day", async () => {
    expect(await count("appointmentDayLocks")).toBe(0);
    const [a, b] = pair();
    const results = await Promise.allSettled([
      a.repository.reserve(salonId, "admin", input()),
      b.repository.reserve(salonId, "admin", input()),
    ]);
    expect(summary(results)).toEqual(["CONFLICT", "ok"]);
    expect(await count("appointments")).toBe(1);
    expect(await count("appointmentDayLocks")).toBe(1);
    assertOrder(a.trace);
    assertOrder(b.trace);
  });

  it("allows adjacent occupied intervals concurrently", async () => {
    const [a, b] = pair();
    const results = await Promise.allSettled([
      a.repository.reserve(salonId, "admin", input()),
      b.repository.reserve(salonId, "admin", input({ startAt: `${date}T13:10:00.000Z` })),
    ]);
    expect(summary(results)).toEqual(["ok", "ok"]);
    const day = await a.repository.getDay(salonId, date);
    expect(day.appointments.map((record) => record.startAt)).toEqual([
      startAt,
      `${date}T13:10:00.000Z`,
    ]);
  });

  it("isolates identical requests and intervals between salons", async () => {
    const otherSalon = `integration-${randomUUID()}`;
    salons.push(otherSalon);
    const otherService = `service-${randomUUID()}`;
    await firestore
      .collection("services")
      .doc(otherService)
      .set({
        ...(await firestore.collection("services").doc(serviceId).get()).data(),
        salonId: otherSalon,
      });
    const request = input();
    const [a, b] = pair();
    const [first, second] = await Promise.all([
      a.repository.reserve(salonId, "admin", request),
      b.repository.reserve(otherSalon, "admin", { ...request, serviceId: otherService }),
    ]);
    expect(first.appointment.id).not.toBe(second.appointment.id);
    expect(
      (await a.repository.getDay(salonId, date)).appointments.map((record) => record.id),
    ).toEqual([first.appointment.id]);
    await expect(
      a.repository.cancel(otherSalon, "admin", first.appointment.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("serializes a block against a reservation on an empty day", async () => {
    const [a, b] = pair();
    const results = await Promise.allSettled([
      a.repository.reserve(salonId, "admin", input()),
      b.repository.createBlock(salonId, "admin", block()),
    ]);
    expect(summary(results)).toEqual(["CONFLICT", "ok"]);
    expect((await count("appointments")) + (await count("timeBlocks"))).toBe(1);
    assertOrder(a.trace);
    assertOrder(b.trace);
  });

  it("returns one creation and one replay for simultaneous normalized requests", async () => {
    const request = input();
    const [a, b] = pair();
    const results = await Promise.all([
      a.repository.reserve(salonId, "admin", request),
      b.repository.reserve(salonId, "another-admin", {
        ...request,
        startAt: `${date}T12:00:00Z`,
        client: { name: " Fixture ", phone: "(11) 99999-9999" },
      }),
    ]);
    expect(results.map((result) => result.replayed).sort()).toEqual([false, true]);
    expect(results[0].appointment.id).toBe(results[1].appointment.id);
    expect(await count("appointments")).toBe(1);
    const guard = (
      await firestore.collection("appointmentDayLocks").where("salonId", "==", salonId).get()
    ).docs[0];
    expect(guard.data().revision).toBe(1);
  });

  it("rejects divergent contents with the same request id", async () => {
    const request = input();
    const [a, b] = pair();
    const results = await Promise.allSettled([
      a.repository.reserve(salonId, "admin", request),
      b.repository.reserve(salonId, "admin", { ...request, startAt: `${date}T15:00:00.000Z` }),
    ]);
    expect(summary(results)).toEqual(["IDEMPOTENCY_CONFLICT", "ok"]);
    const replay = instrument();
    await expect(
      replay.repository.reserve(salonId, "admin", {
        ...request,
        startAt: "2026-11-17T12:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(replay.trace.writes).toBe(0);
    expect(await count("appointments")).toBe(1);
  });

  it("persists UTC Timestamps and retains audit precision without exposing fingerprints", async () => {
    const { repository } = instrument();
    const { appointment } = await repository.reserve(salonId, "admin", input());
    const reference = firestore.collection("appointments").doc(appointment.id);
    const stored = (await reference.get()).data()!;
    for (const key of ["startAt", "endAt", "occupiedUntilAt", "createdAt", "updatedAt"])
      expect(stored[key] instanceof Timestamp).toBe(true);
    expect(typeof stored.fingerprint).toBe("string");
    expect("fingerprint" in appointment).toBe(false);
    await reference.update({ createdAt: Timestamp.fromDate(new Date("2026-11-11T09:34:56.789Z")) });
    expect((await repository.getDay(salonId, date)).appointments[0].createdAt).toBe(
      "2026-11-11T09:34:56.789Z",
    );
  });

  it("cancels idempotently, releases availability and replays the cancelled record", async () => {
    const { repository } = instrument();
    const request = input();
    const created = await repository.reserve(salonId, "admin", request);
    const first = instrument();
    const cancelled = await first.repository.cancel(salonId, "admin", created.appointment.id);
    expect(cancelled.status).toBe("cancelled");
    const repeated = instrument();
    const again = await repeated.repository.cancel(
      salonId,
      "another-admin",
      created.appointment.id,
    );
    expect(again.cancelledAt).toBe(cancelled.cancelledAt);
    expect(again.updatedBy).toBe("admin");
    const replay = await repeated.repository.reserve(salonId, "admin", request);
    expect(replay.replayed).toBe(true);
    expect(replay.appointment.status).toBe("cancelled");
    expect(repeated.trace.writes).toBe(0);
    expect(
      (await repository.getAvailability(salonId, { date, serviceId })).windows[0].startAt,
    ).toBe(startAt);
    await repository.reserve(salonId, "admin", input());
    expect(
      (await repository.getDay(salonId, date)).appointments.map((record) => record.status).sort(),
    ).toEqual(["cancelled", "confirmed"]);
    assertOrder(first.trace);
    assertOrder(repeated.trace);
  });

  it("handles block replay, divergent input, repeated cancellation and whole local days", async () => {
    const { repository, trace } = instrument();
    const request = block({ startAt: `${date}T03:00:00.000Z`, endAt: "2026-11-17T03:00:00.000Z" });
    const created = await repository.createBlock(salonId, "admin", request);
    expect((await repository.getAvailability(salonId, { date, serviceId })).windows).toEqual([]);
    expect((await repository.createBlock(salonId, "admin", request)).replayed).toBe(true);
    await expect(
      repository.createBlock(salonId, "admin", { ...request, reason: "changed" }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(
      repository.cancelBlock("another-salon", "admin", created.timeBlock.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const cancelled = await repository.cancelBlock(salonId, "admin", created.timeBlock.id);
    const noWrite = instrument();
    expect(
      (await noWrite.repository.cancelBlock(salonId, "another-admin", created.timeBlock.id))
        .cancelledAt,
    ).toBe(cancelled.cancelledAt);
    expect((await noWrite.repository.createBlock(salonId, "admin", request)).timeBlock.status).toBe(
      "cancelled",
    );
    expect(noWrite.trace.writes).toBe(0);
    expect((await repository.getDay(salonId, date)).timeBlocks[0].status).toBe("cancelled");
    expect(
      (await repository.getAvailability(salonId, { date, serviceId })).windows[0].startAt,
    ).toBe(startAt);
    assertOrder(trace);
    assertOrder(noWrite.trace);
  });

  it("replays simultaneous block requests without another revision", async () => {
    const [a, b] = pair();
    const request = block();
    const results = await Promise.all([
      a.repository.createBlock(salonId, "admin", request),
      b.repository.createBlock(salonId, "admin", request),
    ]);
    expect(results.map((result) => result.replayed).sort()).toEqual([false, true]);
    expect(results[0].timeBlock.id).toBe(results[1].timeBlock.id);
    expect(await count("timeBlocks")).toBe(1);
  });

  it("keeps old snapshots and reads updated service and hours for new reservations", async () => {
    const { repository } = instrument();
    const first = await repository.reserve(salonId, "admin", input());
    await firestore
      .collection("services")
      .doc(serviceId)
      .update({ durationMinutes: 30, startingPriceCents: 7500 });
    await createFirestoreBusinessHoursRepository(firestore).save(salonId, "primary", {
      ...createDefaultBusinessHoursInput(),
      appointmentIntervalMinutes: 20,
    });
    const next = await repository.reserve(
      salonId,
      "admin",
      input({ startAt: `${date}T13:10:00.000Z` }),
    );
    expect(next.appointment.endAt).toBe(`${date}T13:40:00.000Z`);
    expect(next.appointment.occupiedUntilAt).toBe(`${date}T14:00:00.000Z`);
    expect(next.appointment.serviceSnapshot.startingPriceCents).toBe(7500);
    const old = (await repository.getDay(salonId, date)).appointments[0];
    expect(old.id).toBe(first.appointment.id);
    expect(old.serviceSnapshot.durationMinutes).toBe(60);
    expect(old.serviceSnapshot.startingPriceCents).toBe(5000);
    expect(old.appointmentIntervalMinutes).toBe(10);
    await firestore.collection("services").doc(serviceId).delete();
    expect(
      (await repository.cancel(salonId, "admin", old.id)).serviceSnapshot.durationMinutes,
    ).toBe(60);
  });

  it.each([
    [{ isActive: false }, "SERVICE_INACTIVE"],
    [{ requiresEvaluation: true }, "SERVICE_REQUIRES_EVALUATION"],
  ])("rejects ineligible services %j", async (change, code) => {
    await firestore.collection("services").doc(serviceId).update(change);
    const { repository, trace } = instrument();
    await expect(repository.reserve(salonId, "admin", input())).rejects.toMatchObject({ code });
    await expect(repository.getAvailability(salonId, { date, serviceId })).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
    expect(trace.writes).toBe(0);
  });

  it("hides missing/foreign services and rejects foreign business hours", async () => {
    const { repository } = instrument();
    await expect(repository.reserve("other", "admin", input())).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      repository.getAvailability(salonId, { date, serviceId: "missing" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await createFirestoreBusinessHoursRepository(firestore).save(
      salonId,
      "primary",
      createDefaultBusinessHoursInput(),
    );
    const hours = (
      await firestore.collection("businessHours").where("salonId", "==", salonId).get()
    ).docs[0];
    await hours.ref.update({ professionalId: "foreign" });
    await expect(repository.reserve(salonId, "admin", input())).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it.each(["cancel-first", "reserve-first"] as const)(
    "orders overlapping cancellation and reservation: %s",
    async (order) => {
      const existing = await createFirestoreAppointmentsRepository(firestore).reserve(
        salonId,
        "admin",
        input(),
      );
      const held = deferred();
      const releaseFirst = deferred();
      const secondArrived = deferred();
      const releaseSecond = deferred();
      const first = instrument({
        afterFirst: async () => {
          held.resolve();
          await releaseFirst.promise;
        },
      });
      const second = instrument({
        beforeFirst: async () => {
          secondArrived.resolve();
          await releaseSecond.promise;
        },
      });
      const firstResult = Promise.allSettled([
        order === "cancel-first"
          ? first.repository.cancel(salonId, "admin", existing.appointment.id)
          : first.repository.reserve(salonId, "admin", input()),
      ]);
      await held.promise;
      const secondResult = Promise.allSettled([
        order === "cancel-first"
          ? second.repository.reserve(salonId, "admin", input())
          : second.repository.cancel(salonId, "admin", existing.appointment.id),
      ]);
      await secondArrived.promise;
      releaseFirst.resolve();
      const firstSettled = await firstResult;
      releaseSecond.resolve();
      const secondSettled = await secondResult;
      expect(summary(firstSettled)).toEqual([order === "cancel-first" ? "ok" : "CONFLICT"]);
      expect(summary(secondSettled)).toEqual(["ok"]);
      const day = await first.repository.getDay(salonId, date);
      expect(day.appointments.filter((record) => record.status === "confirmed").length).toBe(
        order === "cancel-first" ? 1 : 0,
      );
      assertOrder(first.trace);
      assertOrder(second.trace);
      expect(first.trace.firstPath).toBe(second.trace.firstPath);
    },
  );

  it.each(["appointment-reserve", "block-block", "appointment-block"] as const)(
    "permits only serially valid results during real cancellation contention: %s",
    async (scenario) => {
      const repository = createFirestoreAppointmentsRepository(firestore);
      const id =
        scenario === "block-block"
          ? (await repository.createBlock(salonId, "admin", block())).timeBlock.id
          : (await repository.reserve(salonId, "admin", input())).appointment.id;
      const [a, b] = pair();
      const results = await Promise.allSettled([
        scenario === "block-block"
          ? a.repository.cancelBlock(salonId, "admin", id)
          : a.repository.cancel(salonId, "admin", id),
        scenario === "appointment-reserve"
          ? b.repository.reserve(salonId, "admin", input())
          : b.repository.createBlock(salonId, "admin", block()),
      ]);
      expect(results[0].status).toBe("fulfilled");
      expect(["CONFLICT,ok", "ok,ok"]).toContain(summary(results).join(","));
      const day = await repository.getDay(salonId, date);
      const active =
        day.appointments.filter((record) => record.status === "confirmed").length +
        day.timeBlocks.filter((record) => record.status === "active").length;
      expect(active).toBe(results[1].status === "fulfilled" ? 1 : 0);
      assertOrder(a.trace);
      assertOrder(b.trace);
      expect(a.trace.firstPath).toBe(b.trace.firstPath);
    },
  );

  it.each(["appointments", "timeBlocks"] as const)(
    "revalidates %s identity and location after the external cancellation pre-read",
    async (collection) => {
      const repository = createFirestoreAppointmentsRepository(firestore);
      const id =
        collection === "appointments"
          ? (await repository.reserve(salonId, "admin", input())).appointment.id
          : (await repository.createBlock(salonId, "admin", block())).timeBlock.id;
      const reference = firestore.collection(collection).doc(id);
      const original = (await reference.get()).data()!;
      for (const change of [
        null,
        { salonId: "foreign" },
        { professionalId: "foreign" },
        { localDate: "2026-11-17" },
        { id: "different" },
      ]) {
        await reference.set(original);
        const observed = instrument({
          beforeFirst: async () => {
            if (change) await reference.update(change);
            else await reference.delete();
          },
        });
        const command =
          collection === "appointments"
            ? observed.repository.cancel(salonId, "admin", id)
            : observed.repository.cancelBlock(salonId, "admin", id);
        await expect(command).rejects.toMatchObject({ code: "NOT_FOUND" });
        expect(observed.trace.writes).toBe(0);
        assertOrder(observed.trace);
      }
      await reference.set(original);
    },
  );
});

describe("Firestore attendance and payment commands", { timeout: 30_000 }, () => {
  const pastStart = "2026-11-09T12:00:00.000Z";
  const futureStart = "2099-11-16T12:00:00.000Z";
  const paid = { finalPriceCents: 9500, paidCents: 9500, method: "pix" as const };

  it("completes with payment, stores UTC Timestamps and keeps the snapshot", async () => {
    const { repository } = instrument();
    const { appointment } = await repository.reserve(
      salonId,
      "admin",
      input({ startAt: pastStart }),
    );
    const completed = await repository.complete(salonId, "closer", appointment.id, {
      payment: paid,
    });
    expect(completed).toMatchObject({ status: "completed", payment: paid, updatedBy: "closer" });
    const stored = (await firestore.collection("appointments").doc(appointment.id).get()).data()!;
    expect(stored.completedAt).toBeInstanceOf(Timestamp);
    expect(stored.paymentUpdatedAt).toBeInstanceOf(Timestamp);
    expect(stored.serviceSnapshot).toEqual(appointment.serviceSnapshot);
    expect(stored.fingerprint).toEqual(expect.any(String));
    const [day] = (await repository.getRange(salonId, "2026-11-09", "2026-11-09")).appointments;
    expect(day).toEqual(completed);
    // Repeating completion is idempotent and does not touch the stored record.
    expect(await repository.complete(salonId, "other", appointment.id, {})).toEqual(completed);
  });

  it("records partial payments later and corrects them", async () => {
    const { repository } = instrument();
    const { appointment } = await repository.reserve(
      salonId,
      "admin",
      input({ startAt: pastStart }),
    );
    await expect(
      repository.recordPayment(salonId, "admin", appointment.id, paid),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await repository.complete(salonId, "admin", appointment.id, {});
    const partial = await repository.recordPayment(salonId, "admin", appointment.id, {
      finalPriceCents: 9500,
      paidCents: 4000,
      method: "cash",
    });
    expect(partial.payment).toEqual({ finalPriceCents: 9500, paidCents: 4000, method: "cash" });
    const settled = await repository.recordPayment(salonId, "admin", appointment.id, paid);
    expect(settled.payment).toEqual(paid);
  });

  it("marks no-show, keeps the period occupied and refuses cancellation afterwards", async () => {
    const { repository } = instrument();
    const { appointment } = await repository.reserve(
      salonId,
      "admin",
      input({ startAt: pastStart }),
    );
    const noShow = await repository.markNoShow(salonId, "admin", appointment.id);
    expect(noShow).toMatchObject({ status: "no_show", noShowAt: expect.any(String) });
    await expect(repository.cancel(salonId, "admin", appointment.id)).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
    await expect(repository.complete(salonId, "admin", appointment.id, {})).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
    await expect(
      repository.reserve(salonId, "admin", input({ startAt: pastStart })),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses to finish an appointment that has not started", async () => {
    const { repository } = instrument();
    const { appointment } = await repository.reserve(
      salonId,
      "admin",
      input({ startAt: futureStart }),
    );
    for (const action of [
      () => repository.complete(salonId, "admin", appointment.id, {}),
      () => repository.markNoShow(salonId, "admin", appointment.id),
    ])
      await expect(action()).rejects.toMatchObject({ code: "NOT_STARTED" });
    expect(
      (await firestore.collection("appointments").doc(appointment.id).get()).get("status"),
    ).toBe("confirmed");
  });

  it("hides appointments of other salons and unknown ids", async () => {
    const { repository } = instrument();
    const { appointment } = await repository.reserve(
      salonId,
      "admin",
      input({ startAt: pastStart }),
    );
    for (const action of [
      () => repository.complete("another-salon", "admin", appointment.id, {}),
      () => repository.markNoShow(salonId, "admin", "missing"),
      () => repository.recordPayment("another-salon", "admin", appointment.id, paid),
    ])
      await expect(action()).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lets exactly one of a concurrent completion and cancellation win", async () => {
    const [a, b] = pair();
    const { appointment } = await instrument().repository.reserve(
      salonId,
      "admin",
      input({ startAt: pastStart }),
    );
    const results = await Promise.allSettled([
      a.repository.complete(salonId, "admin", appointment.id, { payment: paid }),
      b.repository.cancel(salonId, "admin", appointment.id),
    ]);
    const stored = (await firestore.collection("appointments").doc(appointment.id).get()).data()!;
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);
    expect(["completed", "cancelled"]).toContain(stored.status);
    const rejected = results.find((result) => result.status === "rejected");
    expect((rejected as PromiseRejectedResult).reason.code).toBe("INVALID_TRANSITION");
    if (stored.status === "completed") expect(stored.cancelledAt).toBeUndefined();
    else expect(stored.completedAt).toBeUndefined();
  });
});

describe("Firestore reschedule, reminder and client confirmation", { timeout: 30_000 }, () => {
  const monday = "2099-11-16T12:00:00.000Z";
  const tuesday = "2099-11-17T12:00:00.000Z";

  it("moves to another day, locking both days and freeing the original slot", async () => {
    const setup = instrument();
    const { appointment } = await setup.repository.reserve(
      salonId,
      "admin",
      input({ startAt: monday }),
    );
    const { repository, trace } = instrument();
    const moved = await repository.reschedule(salonId, "mover", appointment.id, {
      startAt: tuesday,
    });
    expect(moved).toMatchObject({
      id: appointment.id,
      localDate: "2099-11-17",
      startAt: tuesday,
      serviceSnapshot: appointment.serviceSnapshot,
      updatedBy: "mover",
    });
    const reads = trace.attempts[0];
    expect(reads.slice(0, 2).every((event) => event.startsWith("read:appointmentDayLocks/"))).toBe(
      true,
    );
    expect(trace.writes).toBe(3);
    const stored = (await firestore.collection("appointments").doc(appointment.id).get()).data()!;
    expect(stored.startAt).toBeInstanceOf(Timestamp);
    expect(stored.localDate).toBe("2099-11-17");
    // The Monday slot is free again for a new reservation.
    await expect(
      repository.reserve(salonId, "admin", input({ startAt: monday })),
    ).resolves.toMatchObject({ replayed: false });
    expect(
      (await repository.getRange(salonId, "2099-11-16", "2099-11-17")).appointments.map(
        (record) => record.localDate,
      ),
    ).toEqual(["2099-11-16", "2099-11-17"]);
  });

  it("changes the service with a fresh snapshot and rejects an occupied target", async () => {
    const { repository } = instrument();
    const colorId = `service-${randomUUID()}`;
    await firestore.collection("services").doc(colorId).set({
      salonId,
      name: "Coloração",
      durationMinutes: 120,
      startingPriceCents: 20000,
      hasVariablePrice: true,
      requiresEvaluation: false,
      isActive: true,
    });
    const first = await repository.reserve(salonId, "admin", input({ startAt: monday }));
    const second = await repository.reserve(
      salonId,
      "admin",
      input({ startAt: "2099-11-16T15:00:00.000Z" }),
    );
    // 10:00 local overlaps the first appointment, occupied 09:00–10:10 with its interval.
    await expect(
      repository.reschedule(salonId, "admin", second.appointment.id, {
        startAt: "2099-11-16T13:00:00.000Z",
        serviceId: colorId,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const changed = await repository.reschedule(salonId, "admin", first.appointment.id, {
      startAt: monday,
      serviceId: colorId,
    });
    expect(changed.serviceSnapshot).toMatchObject({ serviceId: colorId, durationMinutes: 120 });
    expect(changed.occupiedUntilAt).toBe("2099-11-16T14:10:00.000Z");
  });

  it("lets only one of a reschedule and a reservation take the same free slot", async () => {
    const { appointment } = await instrument().repository.reserve(
      salonId,
      "admin",
      input({ startAt: monday }),
    );
    const [a, b] = pair();
    const results = await Promise.allSettled([
      a.repository.reschedule(salonId, "admin", appointment.id, { startAt: tuesday }),
      b.repository.reserve(salonId, "admin", input({ startAt: tuesday })),
    ]);
    expect(summary(results)).toEqual(["CONFLICT", "ok"]);
    const tuesdayAppointments = (await instrument().repository.getDay(salonId, "2099-11-17"))
      .appointments;
    expect(tuesdayAppointments).toHaveLength(1);
  });

  it("records the reminder once and clears it from storage after a time change", async () => {
    const { repository } = instrument();
    const { appointment } = await repository.reserve(salonId, "admin", input({ startAt: monday }));
    const reminded = await repository.markReminderSent(salonId, "admin", appointment.id);
    const again = await repository.markReminderSent(salonId, "other", appointment.id);
    expect(again.reminderSentAt).toBe(reminded.reminderSentAt);
    expect(again.updatedBy).toBe("admin");
    const confirmed = await repository.markClientConfirmed(salonId, "admin", appointment.id);
    expect(confirmed.clientConfirmedAt).toEqual(expect.any(String));
    await repository.reschedule(salonId, "admin", appointment.id, { startAt: tuesday });
    const stored = (await firestore.collection("appointments").doc(appointment.id).get()).data()!;
    expect(stored).not.toHaveProperty("reminderSentAt");
    expect(stored).not.toHaveProperty("clientConfirmedAt");
    await repository.cancel(salonId, "admin", appointment.id);
    await expect(
      repository.markReminderSent(salonId, "admin", appointment.id),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });
});

describe("Firestore administrative exceptions", { timeout: 30_000 }, () => {
  const early = `${date}T09:00:00.000Z`; // 06:00 local, before opening
  const earlyEnd = `${date}T10:00:00.000Z`;

  it("rejects out-of-hours and evaluation services by default without writing", async () => {
    const { repository, trace } = instrument();
    await expect(
      repository.reserve(salonId, "admin", input({ startAt: early })),
    ).rejects.toMatchObject({ code: "OUTSIDE_BUSINESS_HOURS" });
    await firestore.collection("services").doc(serviceId).update({ requiresEvaluation: true });
    await expect(repository.reserve(salonId, "admin", input())).rejects.toMatchObject({
      code: "SERVICE_REQUIRES_EVALUATION",
    });
    expect(trace.writes).toBe(0);
  });

  it("persists an accepted out-of-hours exception, returns it and replays it", async () => {
    const { repository } = instrument();
    const request = input({ startAt: early, allowExceptions: true });
    const created = await repository.reserve(salonId, "admin", request);
    expect(created.replayed).toBe(false);
    expect(created.appointment.exceptions).toEqual(["outsideBusinessHours"]);
    const stored = await firestore.collection("appointments").doc(created.appointment.id).get();
    expect(stored.get("exceptions")).toEqual(["outsideBusinessHours"]);
    const replay = await repository.reserve(salonId, "admin", request);
    expect(replay.replayed).toBe(true);
    expect(replay.appointment).toEqual(created.appointment);
    const day = await repository.getDay(salonId, date);
    expect(day.appointments[0].exceptions).toEqual(["outsideBusinessHours"]);
  });

  it("treats allowExceptions as part of the idempotency fingerprint", async () => {
    const { repository } = instrument();
    const request = input({ startAt: early, allowExceptions: true });
    await repository.reserve(salonId, "admin", request);
    await expect(
      repository.reserve(salonId, "admin", { ...request, allowExceptions: false }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("accepts an evaluation service with the exception and keeps it confirmed", async () => {
    await firestore.collection("services").doc(serviceId).update({ requiresEvaluation: true });
    const { repository } = instrument();
    const { appointment } = await repository.reserve(
      salonId,
      "admin",
      input({ allowExceptions: true }),
    );
    expect(appointment.status).toBe("confirmed");
    expect(appointment.exceptions).toEqual(["requiresEvaluation"]);
  });

  it("still blocks conflicts, time blocks and inactive services with exceptions", async () => {
    const { repository } = instrument();
    await repository.reserve(salonId, "admin", input({ startAt: early, allowExceptions: true }));
    await expect(
      repository.reserve(
        salonId,
        "admin",
        input({ startAt: `${date}T09:30:00.000Z`, allowExceptions: true }),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    // 10:00Z is still inside the 10 minute interval of the first appointment.
    await expect(
      repository.reserve(salonId, "admin", input({ startAt: earlyEnd, allowExceptions: true })),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await repository.createBlock(salonId, "admin", {
      requestId: randomUUID(),
      startAt: `${date}T05:00:00.000Z`,
      endAt: `${date}T06:00:00.000Z`,
    });
    await expect(
      repository.reserve(
        salonId,
        "admin",
        input({ startAt: `${date}T05:30:00.000Z`, allowExceptions: true }),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await firestore.collection("services").doc(serviceId).update({ isActive: false });
    await expect(
      repository.reserve(
        salonId,
        "admin",
        input({ startAt: `${date}T20:00:00.000Z`, allowExceptions: true }),
      ),
    ).rejects.toMatchObject({ code: "SERVICE_INACTIVE" });
  });

  it("refuses an appointment that crosses local midnight even with exceptions", async () => {
    const { repository } = instrument();
    await expect(
      repository.reserve(
        salonId,
        "admin",
        input({ startAt: `2026-11-17T02:30:00.000Z`, allowExceptions: true }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_TIME_RANGE" });
  });

  it("reads legacy documents without the exceptions field as empty", async () => {
    const { repository } = instrument();
    const { appointment } = await repository.reserve(salonId, "admin", input());
    await firestore
      .collection("appointments")
      .doc(appointment.id)
      .update({ exceptions: FieldValue.delete() });
    const day = await repository.getDay(salonId, date);
    expect(day.appointments[0].exceptions).toEqual([]);
  });

  it("reschedules with exceptions, persists them and clears them when back in hours", async () => {
    const { repository } = instrument();
    const { appointment } = await repository.reserve(salonId, "admin", input());
    await expect(
      repository.reschedule(salonId, "admin", appointment.id, { startAt: early }),
    ).rejects.toMatchObject({ code: "OUTSIDE_BUSINESS_HOURS" });
    const moved = await repository.reschedule(salonId, "admin", appointment.id, {
      startAt: early,
      allowExceptions: true,
    });
    expect(moved.exceptions).toEqual(["outsideBusinessHours"]);
    const stored = await firestore.collection("appointments").doc(appointment.id).get();
    expect(stored.get("exceptions")).toEqual(["outsideBusinessHours"]);
    const back = await repository.reschedule(salonId, "admin", appointment.id, { startAt });
    expect(back.exceptions).toEqual([]);
  });
});
