// Links existing appointments to client records, grouped by canonical phone.
//
// Usage (credentials come from Application Default Credentials only):
//   GOOGLE_APPLICATION_CREDENTIALS=<path to service account key> //   FIREBASE_PROJECT_ID=<projectId> //   node scripts/migrate-clients.mjs --salon <salonId> [--apply --confirm-project <projectId>]
//
// Without --apply nothing is written (dry run). --apply requires
// --confirm-project equal to FIREBASE_PROJECT_ID, otherwise the script exits
// before reading or writing anything. Idempotent: appointments that already
// have a clientId are skipped and existing phone guards are reused.
// Output contains only the project, the mode and counts: never names or phones.
// See docs/development/appointments.md ("Migração de clientes").
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { Timestamp, getFirestore } from "firebase-admin/firestore";

const PAGE_SIZE = 500;
const BATCH_SIZE = 400;

// Keep in sync with src/domain/clients/phone.ts (covered by a parity test).
export function normalizeBrazilianPhone(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length >= 12 && digits.length <= 15) return digits;
  return null;
}

function parseArgs(argv) {
  let salonId;
  let apply = false;
  let confirmProject;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--apply") apply = true;
    else if (argv[i] === "--salon") salonId = argv[++i];
    else if (argv[i] === "--confirm-project") confirmProject = argv[++i];
    else
      throw new Error(
        "Argumento desconhecido. Uso: --salon <salonId> [--apply --confirm-project <projectId>]",
      );
  }
  if (!salonId || salonId.startsWith("--")) throw new Error("Informe --salon <salonId>.");
  return { salonId, apply, confirmProject };
}

async function readUnlinkedAppointments(firestore, salonId) {
  const groups = new Map();
  let read = 0;
  let invalidPhone = 0;
  let cursor;
  for (;;) {
    let query = firestore
      .collection("appointments")
      .where("salonId", "==", salonId)
      .orderBy("__name__")
      .select("clientId", "client", "startAt")
      .limit(PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;
    for (const document of page.docs) {
      read++;
      const data = document.data();
      if (data.clientId) continue;
      const phoneKey = normalizeBrazilianPhone(data.client?.phone);
      if (!phoneKey) {
        invalidPhone++;
        continue;
      }
      const startMs = data.startAt instanceof Timestamp ? data.startAt.toMillis() : 0;
      const group = groups.get(phoneKey) ?? { refs: [], name: "", nameMs: -1 };
      group.refs.push(document.ref);
      if (startMs >= group.nameMs) {
        group.nameMs = startMs;
        group.name = String(data.client?.name ?? "");
      }
      groups.set(phoneKey, group);
    }
    cursor = page.docs[page.docs.length - 1];
    if (page.size < PAGE_SIZE) break;
  }
  return { groups, read, invalidPhone };
}

export async function migrateClients(firestore, { salonId, apply }) {
  const { groups, read, invalidPhone } = await readUnlinkedAppointments(firestore, salonId);
  const result = {
    appointmentsRead: read,
    phoneGroups: groups.size,
    clientsCreated: 0,
    clientsReused: 0,
    appointmentsLinked: 0,
    appointmentsSkippedInvalidPhone: invalidPhone,
  };
  for (const [phoneKey, group] of groups) {
    const guardRef = firestore
      .collection("clientPhones")
      .doc(createHash("sha256").update(`${salonId}:${phoneKey}`).digest("hex"));
    let clientId;
    let created = false;
    if (apply) {
      const clientRef = firestore.collection("clients").doc();
      await firestore.runTransaction(async (transaction) => {
        created = false;
        const guard = await transaction.get(guardRef);
        if (guard.exists) {
          clientId = guard.get("clientId");
          return;
        }
        const now = Timestamp.now();
        clientId = clientRef.id;
        created = true;
        transaction.create(clientRef, {
          salonId,
          name: group.name.trim().slice(0, 120) || "Sem nome",
          phone: phoneKey,
          chemicalHistory: [],
          createdAt: now,
          updatedAt: now,
          createdBy: "migration",
          updatedBy: "migration",
        });
        transaction.create(guardRef, { salonId, clientId, phone: phoneKey });
      });
      for (let i = 0; i < group.refs.length; i += BATCH_SIZE) {
        const batch = firestore.batch();
        for (const ref of group.refs.slice(i, i + BATCH_SIZE)) batch.update(ref, { clientId });
        await batch.commit();
      }
    } else {
      created = !(await guardRef.get()).exists;
    }
    if (created) result.clientsCreated++;
    else result.clientsReused++;
    result.appointmentsLinked += group.refs.length;
  }
  return result;
}

function isMain() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMain()) {
  const { salonId, apply, confirmProject } = parseArgs(process.argv.slice(2));
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID não está configurado.");
  console.log(`Projeto: ${projectId}`);
  console.log(`Modo: ${apply ? "APLICAR" : "SIMULAÇÃO"}`);
  if (process.env.FIRESTORE_EMULATOR_HOST)
    console.log(`Destino: EMULADOR (${process.env.FIRESTORE_EMULATOR_HOST})`);
  if (apply && confirmProject !== projectId)
    throw new Error("--apply exige --confirm-project igual ao projeto informado acima.");
  const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId });
  const result = await migrateClients(getFirestore(app), { salonId, apply });
  console.log(`Agendamentos lidos: ${result.appointmentsRead}`);
  console.log(`Telefones distintos sem ficha ligada: ${result.phoneGroups}`);
  console.log(`Fichas ${apply ? "criadas" : "a criar"}: ${result.clientsCreated}`);
  console.log(`Fichas ${apply ? "reaproveitadas" : "a reaproveitar"}: ${result.clientsReused}`);
  console.log(`Agendamentos ${apply ? "ligados" : "a ligar"}: ${result.appointmentsLinked}`);
  console.log(
    `Agendamentos ignorados por telefone inválido: ${result.appointmentsSkippedInvalidPhone}`,
  );
}
