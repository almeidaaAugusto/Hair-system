import { spawnSync } from "node:child_process";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { cert, deleteApp, initializeApp, type App } from "firebase-admin/app";
import { Timestamp, getFirestore, type Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { normalizeBrazilianPhone as domainNormalize } from "@/domain/clients/phone";
// @ts-expect-error The migration script is plain ESM without type declarations.
import { normalizeBrazilianPhone as scriptNormalize } from "../../scripts/migrate-clients.mjs";

let app: App;
let firestore: Firestore;
const salonId = `integration-${randomUUID()}`;
const otherSalonId = `integration-${randomUUID()}`;
const script = resolve(process.cwd(), "scripts/migrate-clients.mjs");

function run(salon: string, apply: boolean, confirm: string | null = "demo-sistema-cabelo") {
  const result = spawnSync(
    process.execPath,
    [
      script,
      "--salon",
      salon,
      ...(apply ? ["--apply"] : []),
      ...(apply && confirm !== null ? ["--confirm-project", confirm] : []),
    ],
    {
      env: { ...process.env, FIREBASE_PROJECT_ID: "demo-sistema-cabelo" },
      encoding: "utf8",
      timeout: 60_000,
    },
  );
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}
async function seedAppointment(
  salon: string,
  name: string,
  phone: string,
  startAt: string,
  clientId?: string,
) {
  await firestore
    .collection("appointments")
    .doc(randomUUID())
    .set({
      salonId: salon,
      client: { name, phone },
      startAt: Timestamp.fromDate(new Date(startAt)),
      ...(clientId ? { clientId } : {}),
    });
}
const count = async (collection: string, salon = salonId) =>
  (await firestore.collection(collection).where("salonId", "==", salon).get()).size;

beforeAll(async () => {
  if (
    process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8085" ||
    process.env.GCLOUD_PROJECT !== "demo-sistema-cabelo"
  ) {
    throw new Error("Migration integration requires the local demo emulator.");
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
    `migrate-${randomUUID()}`,
  );
  firestore = getFirestore(app);
  // Same person in three formats (newest name wins), another person, a bad phone.
  await seedAppointment(salonId, "Ana Antiga", "11999991234", "2026-01-10T12:00:00.000Z");
  await seedAppointment(salonId, "Ana Nova", "(11) 99999-1234", "2026-03-10T12:00:00.000Z");
  await seedAppointment(salonId, "Ana Meio", "5511999991234", "2026-02-10T12:00:00.000Z");
  await seedAppointment(salonId, "Carla", "11977776666", "2026-02-11T12:00:00.000Z");
  await seedAppointment(salonId, "Sem Telefone", "123", "2026-02-12T12:00:00.000Z");
  await seedAppointment(
    salonId,
    "Ja Ligada",
    "11955554444",
    "2026-02-13T12:00:00.000Z",
    "existing",
  );
  await seedAppointment(otherSalonId, "Outro Salao", "11999991234", "2026-02-14T12:00:00.000Z");
}, 60_000);

afterAll(async () => {
  if (!firestore) return;
  for (const salon of [salonId, otherSalonId])
    for (const collection of ["appointments", "clients", "clientPhones"]) {
      const own = await firestore.collection(collection).where("salonId", "==", salon).get();
      await Promise.all(own.docs.map((document) => document.ref.delete()));
    }
  await firestore.terminate();
  await deleteApp(app);
}, 60_000);

describe("migrate-clients script", { timeout: 90_000 }, () => {
  it("normalizes phones exactly like the domain", () => {
    for (const raw of [
      "11999991234",
      "(11) 99999-1234",
      "5511999991234",
      "123",
      "",
      "+44 20 7946 0958",
    ])
      expect(scriptNormalize(raw)).toBe(domainNormalize(raw));
  });

  it("rejects missing or unknown arguments", () => {
    expect(run("", false).status).not.toBe(0);
    const bad = spawnSync(process.execPath, [script, "--salon", salonId, "--wat"], {
      env: { ...process.env, FIREBASE_PROJECT_ID: "demo-sistema-cabelo" },
      encoding: "utf8",
    });
    expect(bad.status).not.toBe(0);
  });

  it("refuses --apply without a matching --confirm-project, before touching data", async () => {
    for (const confirm of [null, "hair-sys-piloto"]) {
      const { status, output } = run(salonId, true, confirm);
      expect(status).not.toBe(0);
      expect(output).toContain("Projeto: demo-sistema-cabelo");
      expect(output).toContain("Modo: APLICAR");
      expect(output).not.toContain("Agendamentos lidos");
    }
    expect(await count("clients")).toBe(0);
    expect(await count("clientPhones")).toBe(0);
  });

  it("simulates by default without writing and without exposing personal data", async () => {
    const { status, output } = run(salonId, false);
    expect(status).toBe(0);
    expect(output).toContain("Modo: SIMULAÇÃO");
    expect(output).toMatch(/Destino: EMULADOR \(127\.0\.0\.1:8085\)/);
    // Project and mode are printed before any count.
    expect(output.indexOf("Projeto: demo-sistema-cabelo")).toBeLessThan(
      output.indexOf("Agendamentos lidos"),
    );
    expect(output.indexOf("Modo:")).toBeLessThan(output.indexOf("Agendamentos lidos"));
    expect(output).toContain("Agendamentos lidos: 6");
    expect(output).toContain("Fichas a criar: 2");
    expect(output).toContain("Agendamentos a ligar: 4");
    expect(output).toContain("ignorados por telefone inválido: 1");
    expect(await count("clients")).toBe(0);
    expect(await count("clientPhones")).toBe(0);
  });

  it("applies once, linking appointments, and is idempotent", async () => {
    const applied = run(salonId, true);
    expect(applied.status).toBe(0);
    expect(applied.output).toContain("Fichas criadas: 2");
    expect(applied.output).toContain("Agendamentos ligados: 4");
    for (const pii of ["Ana", "Carla", "99999", "77776", "5511"])
      expect(applied.output).not.toContain(pii);

    expect(await count("clients")).toBe(2);
    expect(await count("clientPhones")).toBe(2);
    const clients = (await firestore.collection("clients").where("salonId", "==", salonId).get())
      .docs;
    const ana = clients.find((document) => document.get("phone") === "5511999991234");
    expect(ana?.get("name")).toBe("Ana Nova");
    const linked = (
      await firestore.collection("appointments").where("salonId", "==", salonId).get()
    ).docs;
    const anaAppointments = linked.filter((d) => d.get("client.name").startsWith("Ana"));
    expect(anaAppointments).toHaveLength(3);
    expect(anaAppointments.every((d) => d.get("clientId") === ana?.id)).toBe(true);
    expect(
      linked.find((d) => d.get("client.name") === "Sem Telefone")?.get("clientId"),
    ).toBeUndefined();
    expect(linked.find((d) => d.get("client.name") === "Ja Ligada")?.get("clientId")).toBe(
      "existing",
    );

    const again = run(salonId, true);
    expect(again.status).toBe(0);
    expect(again.output).toContain("Fichas criadas: 0");
    expect(again.output).toContain("Agendamentos ligados: 0");
    expect(await count("clients")).toBe(2);
    // The other salon is untouched by a run scoped to this one.
    expect(await count("clients", otherSalonId)).toBe(0);
  });

  it("reuses an existing client with the same phone instead of creating one", async () => {
    await seedAppointment(salonId, "Carla Nova", "(11) 97777-6666", "2026-04-01T12:00:00.000Z");
    const result = run(salonId, true);
    expect(result.output).toContain("Fichas criadas: 0");
    expect(result.output).toContain("Fichas reaproveitadas: 1");
    expect(result.output).toContain("Agendamentos ligados: 1");
    expect(await count("clients")).toBe(2);
  });
});
