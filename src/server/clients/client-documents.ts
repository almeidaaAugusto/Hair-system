import { createHash } from "node:crypto";
import {
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";

import { ClientRuleError, clientRecordSchema, type ClientRecord } from "@/domain/clients/client";
import { normalizeBrazilianPhone } from "@/domain/clients/phone";

export const CLIENTS_COLLECTION = "clients";
export const CLIENT_PHONES_COLLECTION = "clientPhones";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function notFound(): never {
  throw new ClientRuleError("NOT_FOUND", "Cliente não encontrada.");
}

/** Uniqueness guard document id: one per salon and canonical phone. */
export function clientPhoneGuardId(salonId: string, phoneKey: string): string {
  return sha256(`${salonId}:${phoneKey}`);
}

export function decodeClient(snapshot: DocumentSnapshot, salonId: string): ClientRecord {
  const data = snapshot.data();
  if (!snapshot.exists || !data || data.salonId !== salonId) notFound();
  const { fingerprint, ...stored } = data;
  void fingerprint;
  for (const key of ["createdAt", "updatedAt"]) {
    if (!(stored[key] instanceof Timestamp)) throw new Error("Invalid stored client timestamp.");
    stored[key] = stored[key].toDate().toISOString();
  }
  return clientRecordSchema.parse({ ...stored, id: snapshot.id });
}

/** Firestore representation of a client; absent optional fields are omitted. */
export function storedClient(client: ClientRecord, fingerprint?: string): DocumentData {
  const { id, ...fields } = client;
  void id;
  return {
    ...fields,
    createdAt: Timestamp.fromDate(new Date(client.createdAt)),
    updatedAt: Timestamp.fromDate(new Date(client.updatedAt)),
    ...(fingerprint === undefined ? {} : { fingerprint }),
  };
}

export type PhoneGuard = { clientId: string };

export async function readPhoneGuard(
  firestore: Firestore,
  transaction: Transaction | undefined,
  salonId: string,
  phoneKey: string,
) {
  const reference = firestore
    .collection(CLIENT_PHONES_COLLECTION)
    .doc(clientPhoneGuardId(salonId, phoneKey));
  const snapshot = transaction ? await transaction.get(reference) : await reference.get();
  const data = snapshot.data();
  if (!snapshot.exists || !data) return { reference, guard: null };
  if (data.salonId !== salonId || typeof data.clientId !== "string")
    throw new Error("Invalid phone guard.");
  return { reference, guard: { clientId: data.clientId } satisfies PhoneGuard };
}

export function phoneGuardData(salonId: string, clientId: string, phoneKey: string): DocumentData {
  return { salonId, clientId, phone: phoneKey };
}

type ReservationClient = {
  clientId: string;
  name: string;
  phone: string;
  /** Writes the new client and guard; call only after every transactional read is done. */
  commit(): void;
};

/**
 * Resolves the client of a reservation inside its transaction (reads only):
 * an existing client by id, the one owning the phone, or a new one to be
 * created by `commit()`. Never creates a duplicate for the same phone.
 */
export async function resolveReservationClient(
  firestore: Firestore,
  transaction: Transaction,
  context: { salonId: string; userId: string; now: string },
  target: { clientId: string } | { client: { name: string; phone: string } },
): Promise<ReservationClient> {
  const { salonId, userId, now } = context;
  if ("clientId" in target) {
    const snapshot = await transaction.get(
      firestore.collection(CLIENTS_COLLECTION).doc(target.clientId),
    );
    const client = decodeClient(snapshot, salonId);
    return { clientId: client.id, name: client.name, phone: client.phone, commit() {} };
  }
  const phoneKey = normalizeBrazilianPhone(target.client.phone);
  if (!phoneKey) throw new Error("Invalid client phone.");
  const { reference: guardReference, guard } = await readPhoneGuard(
    firestore,
    transaction,
    salonId,
    phoneKey,
  );
  if (guard) {
    const snapshot = await transaction.get(
      firestore.collection(CLIENTS_COLLECTION).doc(guard.clientId),
    );
    const client = decodeClient(snapshot, salonId);
    return { clientId: client.id, name: client.name, phone: client.phone, commit() {} };
  }
  const reference = firestore.collection(CLIENTS_COLLECTION).doc();
  const name = target.client.name.trim().slice(0, 120);
  const record: ClientRecord = {
    id: reference.id,
    salonId,
    name,
    phone: phoneKey,
    chemicalHistory: [],
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
    updatedBy: userId,
  };
  return {
    clientId: reference.id,
    name,
    phone: phoneKey,
    commit() {
      transaction.create(reference, storedClient(record));
      transaction.create(guardReference, phoneGuardData(salonId, reference.id, phoneKey));
    },
  };
}
