import { generateKeyPairSync, randomUUID } from "node:crypto";
import { cert, deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { CreateAppointmentInput } from "@/domain/appointments/appointment";
import { summarizeClientHistory } from "@/domain/clients/history";
import { createFirestoreAppointmentsRepository } from "@/server/appointments/firestore-appointments-repository";
import { createFirestoreClientsRepository } from "@/server/clients/firestore-clients-repository";

const collections = [
  "services",
  "businessHours",
  "appointments",
  "timeBlocks",
  "appointmentDayLocks",
  "clients",
  "clientPhones",
];
let app: App;
let firestore: Firestore;
let salonId: string;
let serviceId: string;
const salons: string[] = [];

const clientsRepo = () => createFirestoreClientsRepository(firestore);
const appointmentsRepo = () => createFirestoreAppointmentsRepository(firestore);

function booking(overrides: Partial<CreateAppointmentInput> = {}): CreateAppointmentInput {
  return {
    requestId: randomUUID(),
    serviceId,
    startAt: "2026-11-16T12:00:00.000Z",
    client: { name: "Ana", phone: "11999991234" },
    source: "manual",
    ...overrides,
  };
}
function newClient(overrides: Record<string, unknown> = {}) {
  return { requestId: randomUUID(), name: "Bia", phone: "5511988887777", ...overrides };
}
async function count(collection: string) {
  return (await firestore.collection(collection).where("salonId", "==", salonId).get()).size;
}
async function seedService(salon: string) {
  const id = `service-${randomUUID()}`;
  await firestore.collection("services").doc(id).set({
    salonId: salon,
    name: "Corte",
    durationMinutes: 60,
    startingPriceCents: 5000,
    hasVariablePrice: false,
    requiresEvaluation: false,
    isActive: true,
  });
  return id;
}

beforeAll(() => {
  if (
    process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8085" ||
    process.env.GCLOUD_PROJECT !== "demo-sistema-cabelo"
  ) {
    throw new Error("Clients integration requires the local demo emulator.");
  }
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
    `clients-${randomUUID()}`,
  );
  firestore = getFirestore(app);
});
beforeEach(async () => {
  salonId = `integration-${randomUUID()}`;
  salons.push(salonId);
  serviceId = await seedService(salonId);
});
afterAll(async () => {
  if (!firestore) return;
  for (const salon of salons)
    for (const collection of collections) {
      const own = await firestore.collection(collection).where("salonId", "==", salon).get();
      await Promise.all(own.docs.map((document) => document.ref.delete()));
    }
  await firestore.terminate();
  await deleteApp(app);
}, 60_000);

describe("client registry through reservations", { timeout: 30_000 }, () => {
  it("creates a client for a new phone and links an existing one in any format", async () => {
    const first = await appointmentsRepo().reserve(salonId, "admin", booking());
    expect(first.appointment.clientId).toBeDefined();
    expect(await count("clients")).toBe(1);
    expect(await count("clientPhones")).toBe(1);

    const formats = ["(11) 99999-1234", "+55 11 99999-1234", "5511999991234"];
    for (const [index, phone] of formats.entries()) {
      const next = await appointmentsRepo().reserve(
        salonId,
        "admin",
        booking({
          startAt: `2026-11-16T${String(14 + index * 2).padStart(2, "0")}:00:00.000Z`,
          client: { name: "Outro nome", phone: phone.replace(/\D/g, "") },
        }),
      );
      expect(next.appointment.clientId).toBe(first.appointment.clientId);
      expect(next.appointment.client).toEqual({ name: "Ana", phone: "5511999991234" });
    }
    expect(await count("clients")).toBe(1);
    const found = await clientsRepo().findByPhone(salonId, "(11) 99999-1234");
    expect(found?.id).toBe(first.appointment.clientId);
  });

  it.each([
    ["different days", "2026-11-17T12:00:00.000Z"],
    ["the same day", "2026-11-16T15:00:00.000Z"],
  ])(
    "creates a single client for concurrent reservations of one new phone (%s)",
    async (_, other) => {
      const results = await Promise.all([
        appointmentsRepo().reserve(salonId, "admin", booking()),
        appointmentsRepo().reserve(salonId, "admin", booking({ startAt: other })),
      ]);
      expect(await count("clients")).toBe(1);
      expect(await count("clientPhones")).toBe(1);
      expect(new Set(results.map((r) => r.appointment.clientId)).size).toBe(1);
      expect(await count("appointments")).toBe(2);
    },
  );

  it("books by clientId using the client's current name and phone", async () => {
    const { client } = await clientsRepo().create(salonId, "admin", newClient());
    const result = await appointmentsRepo().reserve(
      salonId,
      "admin",
      booking({ client: undefined, clientId: client.id }),
    );
    expect(result.appointment.clientId).toBe(client.id);
    expect(result.appointment.client).toEqual({ name: "Bia", phone: "5511988887777" });
    expect(await count("clients")).toBe(1);
  });

  it("rejects an unknown clientId and a client of another salon without writing", async () => {
    const otherSalon = `integration-${randomUUID()}`;
    salons.push(otherSalon);
    const { client } = await clientsRepo().create(otherSalon, "admin", newClient());
    for (const clientId of ["missing", client.id]) {
      await expect(
        appointmentsRepo().reserve(salonId, "admin", booking({ client: undefined, clientId })),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    expect(await count("appointments")).toBe(0);
  });

  it("does not create a client when the reservation fails", async () => {
    await expect(
      appointmentsRepo().reserve(salonId, "admin", booking({ serviceId: "missing" })),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await count("clients")).toBe(0);
    expect(await count("clientPhones")).toBe(0);
  });

  it("replays the same request without a second client and keeps the snapshot after edits", async () => {
    const request = booking();
    const first = await appointmentsRepo().reserve(salonId, "admin", request);
    const replay = await appointmentsRepo().reserve(salonId, "admin", request);
    expect(replay.replayed).toBe(true);
    expect(replay.appointment.clientId).toBe(first.appointment.clientId);
    expect(await count("clients")).toBe(1);

    await clientsRepo().update(salonId, "admin", first.appointment.clientId!, {
      name: "Ana Maria",
    });
    const day = await appointmentsRepo().getDay(salonId, "2026-11-16");
    expect(day.appointments[0].client.name).toBe("Ana");
    // A replay still matches after the client changed.
    expect((await appointmentsRepo().reserve(salonId, "admin", request)).replayed).toBe(true);
  });

  it("keeps clientId when rescheduling", async () => {
    const { appointment } = await appointmentsRepo().reserve(salonId, "admin", booking());
    const moved = await appointmentsRepo().reschedule(salonId, "admin", appointment.id, {
      startAt: "2026-11-17T12:00:00.000Z",
    });
    expect(moved.clientId).toBe(appointment.clientId);
    expect(
      (await appointmentsRepo().listByClient(salonId, appointment.clientId!))[0].clientId,
    ).toBe(appointment.clientId);
  });

  it("lists the history most recent first, including cancelled, and summarizes it", async () => {
    const a = await appointmentsRepo().reserve(
      salonId,
      "admin",
      booking({ startAt: "2026-11-09T12:00:00.000Z" }),
    );
    const b = await appointmentsRepo().reserve(
      salonId,
      "admin",
      booking({ startAt: "2026-11-17T12:00:00.000Z" }),
    );
    const c = await appointmentsRepo().reserve(
      salonId,
      "admin",
      booking({ startAt: "2026-11-18T12:00:00.000Z" }),
    );
    await appointmentsRepo().complete(salonId, "admin", a.appointment.id, {
      payment: { finalPriceCents: 8000, paidCents: 5000, method: "pix" },
    });
    await appointmentsRepo().cancel(salonId, "admin", b.appointment.id);
    const history = await appointmentsRepo().listByClient(salonId, a.appointment.clientId!);
    expect(history.map((item) => item.id)).toEqual([
      c.appointment.id,
      b.appointment.id,
      a.appointment.id,
    ]);
    expect(summarizeClientHistory(history, "2026-11-13T00:00:00.000Z")).toMatchObject({
      completedCount: 1,
      cancelledCount: 1,
      totalPaidCents: 5000,
      totalOutstandingCents: 3000,
      nextConfirmedAt: "2026-11-18T12:00:00.000Z",
    });
    expect(await appointmentsRepo().listByClient(salonId, "someone-else")).toEqual([]);
  });
});

describe("client records", { timeout: 30_000 }, () => {
  it("creates idempotently and refuses a second client for the same phone", async () => {
    const input = newClient({
      instagram: "@Bia.Hair",
      notes: "alérgica",
      birthday: { day: 5, month: 3 },
    });
    const first = await clientsRepo().create(salonId, "admin", input);
    expect(first.replayed).toBe(false);
    expect(first.client).toMatchObject({ instagram: "bia.hair", phone: "5511988887777" });
    expect((await clientsRepo().create(salonId, "admin", input)).replayed).toBe(true);
    await expect(
      clientsRepo().create(salonId, "admin", { ...input, name: "Changed" }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(
      clientsRepo().create(salonId, "admin", newClient({ phone: "(11) 98888-7777" })),
    ).rejects.toMatchObject({ code: "CLIENT_PHONE_TAKEN", clientId: first.client.id });
    expect(await count("clients")).toBe(1);
  });

  it("creates a single client for concurrent creations of the same phone", async () => {
    const results = await Promise.allSettled([
      clientsRepo().create(salonId, "admin", newClient()),
      clientsRepo().create(salonId, "admin", newClient({ name: "Other" })),
    ]);
    expect(results.map((r) => (r.status === "fulfilled" ? "ok" : r.reason.code)).sort()).toEqual([
      "CLIENT_PHONE_TAKEN",
      "ok",
    ]);
    expect(await count("clients")).toBe(1);
  });

  it("scopes phones per salon", async () => {
    const otherSalon = `integration-${randomUUID()}`;
    salons.push(otherSalon);
    await clientsRepo().create(salonId, "admin", newClient());
    await expect(clientsRepo().create(otherSalon, "admin", newClient())).resolves.toBeDefined();
    expect(await clientsRepo().findByPhone(otherSalon, "11988887777")).not.toBeNull();
    const third = `integration-${randomUUID()}`;
    expect(await clientsRepo().findByPhone(third, "11988887777")).toBeNull();
  });

  it("lists by name and returns only list fields", async () => {
    await clientsRepo().create(
      salonId,
      "admin",
      newClient({ name: "Zélia", phone: "11911110001" }),
    );
    await clientsRepo().create(
      salonId,
      "admin",
      newClient({ name: "Ana", phone: "11911110002", notes: "x" }),
    );
    await clientsRepo().create(salonId, "admin", newClient({ name: "Édna", phone: "11911110003" }));
    const list = await clientsRepo().list(salonId);
    expect(list.map((item) => item.name)).toEqual(["Ana", "Édna", "Zélia"]);
    expect(Object.keys(list[0]).sort()).toEqual(["id", "name", "phone"]);
  });

  it("refuses to edit a phone already used and accepts a free one, releasing the old", async () => {
    const a = (await clientsRepo().create(salonId, "admin", newClient())).client;
    const b = (
      await clientsRepo().create(salonId, "admin", newClient({ name: "Cia", phone: "11977776666" }))
    ).client;
    await expect(
      clientsRepo().update(salonId, "admin", b.id, { phone: "(11) 98888-7777" }),
    ).rejects.toMatchObject({ code: "CLIENT_PHONE_TAKEN", clientId: a.id });
    expect((await clientsRepo().get(salonId, b.id)).phone).toBe("5511977776666");

    const moved = await clientsRepo().update(salonId, "admin", b.id, { phone: "11 95555-4444" });
    expect(moved.phone).toBe("5511955554444");
    expect((await clientsRepo().findByPhone(salonId, "11955554444"))?.id).toBe(b.id);
    expect(await clientsRepo().findByPhone(salonId, "11977776666")).toBeNull();
    await expect(
      clientsRepo().create(salonId, "admin", newClient({ phone: "11977776666" })),
    ).resolves.toBeDefined();
    // Same phone in another format is not a change and not a conflict.
    await expect(
      clientsRepo().update(salonId, "admin", b.id, { phone: "+55 (11) 95555-4444" }),
    ).resolves.toBeDefined();
  });

  it("updates partially and clears optional fields with null", async () => {
    const { client } = await clientsRepo().create(
      salonId,
      "admin",
      newClient({ instagram: "bia", notes: "n", birthday: { day: 1, month: 1 } }),
    );
    const updated = await clientsRepo().update(salonId, "admin", client.id, {
      name: "Bia Silva",
      instagram: null,
      birthday: null,
    });
    expect(updated).toMatchObject({ name: "Bia Silva", notes: "n" });
    expect(updated.instagram).toBeUndefined();
    const stored = await clientsRepo().get(salonId, client.id);
    expect(stored.instagram).toBeUndefined();
    expect(stored.birthday).toBeUndefined();
    expect(stored.notes).toBe("n");
    await expect(clientsRepo().get(`other-${salonId}`, client.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      clientsRepo().update(salonId, "admin", "missing", { name: "X" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("adds, replays, orders, limits and removes chemical history entries", async () => {
    const { client } = await clientsRepo().create(salonId, "admin", newClient());
    const entry = { requestId: randomUUID(), localDate: "2026-05-01", procedure: "Progressiva" };
    const first = await clientsRepo().addChemicalEntry(salonId, "admin", client.id, entry);
    expect(first.replayed).toBe(false);
    expect(
      (await clientsRepo().addChemicalEntry(salonId, "admin", client.id, entry)).replayed,
    ).toBe(true);
    await expect(
      clientsRepo().addChemicalEntry(salonId, "admin", client.id, { ...entry, procedure: "Outro" }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    const newer = await clientsRepo().addChemicalEntry(salonId, "admin", client.id, {
      requestId: randomUUID(),
      localDate: "2026-09-01",
      procedure: "Coloração",
      product: "Marca X",
    });
    expect(newer.client.chemicalHistory.map((item) => item.procedure)).toEqual([
      "Coloração",
      "Progressiva",
    ]);

    const afterRemoval = await clientsRepo().removeChemicalEntry(
      salonId,
      "admin",
      client.id,
      first.entry.id,
    );
    expect(afterRemoval.chemicalHistory.map((item) => item.id)).toEqual([newer.entry.id]);
    expect(
      (await clientsRepo().removeChemicalEntry(salonId, "admin", client.id, first.entry.id))
        .chemicalHistory,
    ).toHaveLength(1);

    for (let i = 0; i < 99; i++)
      await clientsRepo().addChemicalEntry(salonId, "admin", client.id, {
        requestId: randomUUID(),
        localDate: "2026-01-01",
        procedure: `P${i}`,
      });
    await expect(
      clientsRepo().addChemicalEntry(salonId, "admin", client.id, {
        requestId: randomUUID(),
        localDate: "2026-01-01",
        procedure: "extra",
      }),
    ).rejects.toMatchObject({ code: "CHEMICAL_HISTORY_FULL" });
  }, 120_000);
});
