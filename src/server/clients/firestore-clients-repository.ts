import { FieldValue, getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";

import { documentIdSchema } from "@/domain/appointments/appointment";
import {
  ClientRuleError,
  MAX_CHEMICAL_HISTORY_ENTRIES,
  MAX_LISTED_CLIENTS,
  chemicalEntryInputSchema,
  createClientInputSchema,
  updateClientInputSchema,
  type ChemicalEntry,
  type ClientRecord,
} from "@/domain/clients/client";
import { normalizeBrazilianPhone } from "@/domain/clients/phone";
import { getAdminApp } from "@/server/firebase/admin";
import {
  CLIENTS_COLLECTION,
  CLIENT_PHONES_COLLECTION,
  clientPhoneGuardId,
  decodeClient,
  phoneGuardData,
  readPhoneGuard,
  sha256,
  storedClient,
} from "./client-documents";
import type { ClientsRepository } from "./clients-repository";

const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });

function phoneTaken(clientId: string): never {
  throw new ClientRuleError(
    "CLIENT_PHONE_TAKEN",
    "Já existe uma cliente com este telefone.",
    clientId,
  );
}

function sameEntryContent(a: ChemicalEntry, b: ChemicalEntry): boolean {
  return (
    a.localDate === b.localDate &&
    a.procedure === b.procedure &&
    a.product === b.product &&
    a.notes === b.notes
  );
}

/** Most recent procedure first; entries on the same day keep the newest-added first. */
function sortHistory(entries: ChemicalEntry[]): ChemicalEntry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => b.entry.localDate.localeCompare(a.entry.localDate) || a.index - b.index)
    .map(({ entry }) => entry);
}

export function createFirestoreClientsRepository(
  firestore: Firestore = getFirestore(getAdminApp()),
): ClientsRepository {
  const clients = () => firestore.collection(CLIENTS_COLLECTION);

  return {
    async list(salon) {
      const salonId = documentIdSchema.parse(salon);
      const snapshot = await clients()
        .where("salonId", "==", salonId)
        .orderBy("name", "asc")
        .limit(MAX_LISTED_CLIENTS)
        .get();
      return snapshot.docs
        .map((document) => decodeClient(document, salonId))
        .sort((a, b) => collator.compare(a.name, b.name))
        .map(({ id, name, phone, instagram, birthday }) => ({
          id,
          name,
          phone,
          ...(instagram === undefined ? {} : { instagram }),
          ...(birthday === undefined ? {} : { birthday }),
        }));
    },

    async findByPhone(salon, phone) {
      const salonId = documentIdSchema.parse(salon);
      const phoneKey = normalizeBrazilianPhone(phone);
      if (!phoneKey) return null;
      const { guard } = await readPhoneGuard(firestore, undefined, salonId, phoneKey);
      if (!guard) return null;
      return decodeClient(await clients().doc(guard.clientId).get(), salonId);
    },

    async get(salon, id) {
      const salonId = documentIdSchema.parse(salon);
      return decodeClient(await clients().doc(documentIdSchema.parse(id)).get(), salonId);
    },

    async create(salon, user, value) {
      const salonId = documentIdSchema.parse(salon);
      const userId = documentIdSchema.parse(user);
      const input = createClientInputSchema.parse(value);
      const id = sha256(JSON.stringify([salonId, "createClient", input.requestId]));
      const fingerprint = sha256(JSON.stringify(input));
      const reference = clients().doc(id);
      const now = new Date().toISOString();
      return firestore.runTransaction(async (transaction) => {
        const existing = await transaction.get(reference);
        if (existing.exists) {
          if (existing.get("fingerprint") !== fingerprint) {
            throw new ClientRuleError(
              "IDEMPOTENCY_CONFLICT",
              "A chave de requisição já foi utilizada com outro conteúdo.",
            );
          }
          return { client: decodeClient(existing, salonId), replayed: true };
        }
        const { reference: guardReference, guard } = await readPhoneGuard(
          firestore,
          transaction,
          salonId,
          input.phone,
        );
        if (guard) phoneTaken(guard.clientId);
        const client: ClientRecord = {
          id,
          salonId,
          name: input.name,
          phone: input.phone,
          ...(input.instagram === undefined ? {} : { instagram: input.instagram }),
          ...(input.birthday === undefined ? {} : { birthday: input.birthday }),
          ...(input.notes === undefined ? {} : { notes: input.notes }),
          chemicalHistory: [],
          createdAt: now,
          updatedAt: now,
          createdBy: userId,
          updatedBy: userId,
        };
        transaction.create(reference, storedClient(client, fingerprint));
        transaction.create(guardReference, phoneGuardData(salonId, id, input.phone));
        return { client, replayed: false };
      });
    },

    async update(salon, user, id, value) {
      const salonId = documentIdSchema.parse(salon);
      const userId = documentIdSchema.parse(user);
      const input = updateClientInputSchema.parse(value);
      const reference = clients().doc(documentIdSchema.parse(id));
      const now = new Date().toISOString();
      return firestore.runTransaction(async (transaction) => {
        const current = decodeClient(await transaction.get(reference), salonId);
        const changesPhone = input.phone !== undefined && input.phone !== current.phone;
        let newGuard: Awaited<ReturnType<typeof readPhoneGuard>> | undefined;
        if (changesPhone) {
          newGuard = await readPhoneGuard(firestore, transaction, salonId, input.phone!);
          if (newGuard.guard && newGuard.guard.clientId !== current.id)
            phoneTaken(newGuard.guard.clientId);
        }
        const next: ClientRecord = { ...current, updatedAt: now, updatedBy: userId };
        const patch: Record<string, unknown> = {
          updatedAt: Timestamp.fromDate(new Date(now)),
          updatedBy: userId,
        };
        if (input.name !== undefined) {
          next.name = input.name;
          patch.name = input.name;
        }
        if (changesPhone) {
          next.phone = input.phone!;
          patch.phone = input.phone;
        }
        for (const key of ["instagram", "birthday", "notes"] as const) {
          const value = input[key];
          if (value === undefined) continue;
          if (value === null) {
            delete next[key];
            patch[key] = FieldValue.delete();
          } else {
            Object.assign(next, { [key]: value });
            patch[key] = value;
          }
        }
        transaction.update(reference, patch);
        if (newGuard) {
          transaction.delete(
            firestore
              .collection(CLIENT_PHONES_COLLECTION)
              .doc(clientPhoneGuardId(salonId, current.phone)),
          );
          transaction.set(newGuard.reference, phoneGuardData(salonId, current.id, input.phone!));
        }
        return next;
      });
    },

    async addChemicalEntry(salon, user, id, value) {
      const salonId = documentIdSchema.parse(salon);
      const userId = documentIdSchema.parse(user);
      const input = chemicalEntryInputSchema.parse(value);
      const reference = clients().doc(documentIdSchema.parse(id));
      const entryId = sha256(JSON.stringify([reference.id, "chemical", input.requestId])).slice(
        0,
        32,
      );
      const entry: ChemicalEntry = {
        id: entryId,
        localDate: input.localDate,
        procedure: input.procedure,
        ...(input.product === undefined ? {} : { product: input.product }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
      };
      const now = new Date().toISOString();
      return firestore.runTransaction(async (transaction) => {
        const current = decodeClient(await transaction.get(reference), salonId);
        const existing = current.chemicalHistory.find((item) => item.id === entryId);
        if (existing) {
          if (!sameEntryContent(existing, entry)) {
            throw new ClientRuleError(
              "IDEMPOTENCY_CONFLICT",
              "A chave de requisição já foi utilizada com outro conteúdo.",
            );
          }
          return { client: current, entry: existing, replayed: true };
        }
        if (current.chemicalHistory.length >= MAX_CHEMICAL_HISTORY_ENTRIES) {
          throw new ClientRuleError(
            "CHEMICAL_HISTORY_FULL",
            "O histórico químico atingiu o limite de itens.",
          );
        }
        const chemicalHistory = sortHistory([entry, ...current.chemicalHistory]);
        transaction.update(reference, {
          chemicalHistory,
          updatedAt: Timestamp.fromDate(new Date(now)),
          updatedBy: userId,
        });
        return {
          client: { ...current, chemicalHistory, updatedAt: now, updatedBy: userId },
          entry,
          replayed: false,
        };
      });
    },

    async removeChemicalEntry(salon, user, id, entryValue) {
      const salonId = documentIdSchema.parse(salon);
      const userId = documentIdSchema.parse(user);
      const entryId = documentIdSchema.parse(entryValue);
      const reference = clients().doc(documentIdSchema.parse(id));
      const now = new Date().toISOString();
      return firestore.runTransaction(async (transaction) => {
        const current = decodeClient(await transaction.get(reference), salonId);
        const chemicalHistory = current.chemicalHistory.filter((entry) => entry.id !== entryId);
        // Removing an entry that is already gone is a no-op, so a double click is harmless.
        if (chemicalHistory.length === current.chemicalHistory.length) return current;
        transaction.update(reference, {
          chemicalHistory,
          updatedAt: Timestamp.fromDate(new Date(now)),
          updatedBy: userId,
        });
        return { ...current, chemicalHistory, updatedAt: now, updatedBy: userId };
      });
    },
  };
}
