import { createHash } from "node:crypto";
import {
  getFirestore,
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";

import {
  AppointmentRuleError,
  appointmentSchema,
  availabilityQuerySchema,
  createAppointmentInputSchema,
  createTimeBlockInputSchema,
  documentIdSchema,
  localDateSchema,
  timeBlockSchema,
  type Appointment,
  type TimeBlock,
} from "@/domain/appointments/appointment";
import {
  buildAppointment,
  buildTimeBlock,
  calculateAvailability,
} from "@/domain/appointments/availability";
import { getLocalDate } from "@/domain/appointments/local-date";
import {
  BUSINESS_HOURS_TIME_ZONE,
  DEFAULT_PROFESSIONAL_ID,
  businessHoursSchema,
  createDefaultBusinessHoursInput,
} from "@/domain/business-hours/business-hours";
import { createServiceSchema } from "@/domain/services/service";
import { businessHoursDocumentId } from "@/server/business-hours/business-hours-repository";
import { getAdminApp } from "@/server/firebase/admin";
import type { AppointmentsRepository } from "./appointments-repository";

type Scope = { salonId: string; localDate: string };
type AgendaRecord = Appointment | TimeBlock;
type Decoder<T> = (snapshot: DocumentSnapshot, scope: Scope) => T;
const instantFields = [
  "startAt",
  "endAt",
  "occupiedUntilAt",
  "createdAt",
  "updatedAt",
  "cancelledAt",
];

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function notFound(): never {
  throw new AppointmentRuleError("NOT_FOUND", "Registro não encontrado.");
}

function scopedData(snapshot: DocumentSnapshot, scope: Scope): DocumentData {
  const data = snapshot.data();
  if (
    !snapshot.exists ||
    !data ||
    data.salonId !== scope.salonId ||
    data.professionalId !== DEFAULT_PROFESSIONAL_ID ||
    data.localDate !== scope.localDate
  )
    notFound();
  return data;
}

function domainData(snapshot: DocumentSnapshot, scope: Scope): DocumentData {
  const data = { ...scopedData(snapshot, scope) };
  if (data.id !== snapshot.id) notFound();
  delete data.fingerprint;
  for (const key of instantFields) {
    if (data[key] === undefined) continue;
    if (!(data[key] instanceof Timestamp)) throw new Error("Invalid stored agenda timestamp.");
    data[key] = data[key].toDate().toISOString();
  }
  if (getLocalDate(data.startAt) !== scope.localDate) notFound();
  return data;
}

const decodeAppointment: Decoder<Appointment> = (snapshot, scope) =>
  appointmentSchema.parse(domainData(snapshot, scope));
const decodeTimeBlock: Decoder<TimeBlock> = (snapshot, scope) =>
  timeBlockSchema.parse(domainData(snapshot, scope));

function storedRecord(record: AgendaRecord, fingerprint: string): DocumentData {
  const data: DocumentData = { ...record, fingerprint };
  for (const key of instantFields) {
    if (data[key] !== undefined) data[key] = Timestamp.fromDate(new Date(data[key]));
  }
  return data;
}

export function createFirestoreAppointmentsRepository(
  firestore: Firestore = getFirestore(getAdminApp()),
): AppointmentsRepository {
  function dayQuery(collection: string, scope: Scope) {
    return firestore
      .collection(collection)
      .where("salonId", "==", scope.salonId)
      .where("professionalId", "==", DEFAULT_PROFESSIONAL_ID)
      .where("localDate", "==", scope.localDate)
      .orderBy("startAt", "asc");
  }

  async function readDay(scope: Scope, transaction?: Transaction) {
    const appointmentsQuery = dayQuery("appointments", scope);
    const blocksQuery = dayQuery("timeBlocks", scope);
    // Finish each transactional read before starting another: a rejected read
    // must not leave requests in flight after the SDK rolls back the callback.
    const [appointments, blocks] = transaction
      ? [await transaction.get(appointmentsQuery), await transaction.get(blocksQuery)]
      : await Promise.all([appointmentsQuery.get(), blocksQuery.get()]);
    return {
      appointments: appointments.docs.map((document) => decodeAppointment(document, scope)),
      timeBlocks: blocks.docs.map((document) => decodeTimeBlock(document, scope)),
    };
  }

  async function readServiceAndHours(
    salonId: string,
    serviceId: string,
    transaction?: Transaction,
  ) {
    const serviceRef = firestore.collection("services").doc(serviceId);
    const hoursRef = firestore
      .collection("businessHours")
      .doc(businessHoursDocumentId(salonId, DEFAULT_PROFESSIONAL_ID));
    const [serviceSnapshot, hoursSnapshot] = transaction
      ? [await transaction.get(serviceRef), await transaction.get(hoursRef)]
      : await Promise.all([serviceRef.get(), hoursRef.get()]);
    const serviceData = serviceSnapshot.data();
    if (!serviceSnapshot.exists || serviceData?.salonId !== salonId) notFound();
    const service = { ...createServiceSchema.strip().parse(serviceData), id: serviceId, salonId };
    const hoursData = hoursSnapshot.data();
    if (
      hoursSnapshot.exists &&
      (hoursData?.salonId !== salonId || hoursData.professionalId !== DEFAULT_PROFESSIONAL_ID)
    )
      notFound();
    const businessHours = businessHoursSchema.parse(
      hoursData ?? {
        ...createDefaultBusinessHoursInput(),
        salonId,
        professionalId: DEFAULT_PROFESSIONAL_ID,
        timezone: BUSINESS_HOURS_TIME_ZONE,
      },
    );
    return { service, businessHours };
  }

  async function readGuard(transaction: Transaction, scope: Scope) {
    const reference = firestore
      .collection("appointmentDayLocks")
      .doc(hash([scope.salonId, DEFAULT_PROFESSIONAL_ID, scope.localDate]));
    // This awaited read MUST precede every other transactional read for all commands.
    const snapshot = await transaction.get(reference);
    const revision = snapshot.exists ? scopedData(snapshot, scope).revision : 0;
    if (!Number.isSafeInteger(revision) || revision < 0 || revision === Number.MAX_SAFE_INTEGER)
      throw new Error("Invalid agenda revision.");
    return { reference, revision };
  }

  function writeGuard(
    transaction: Transaction,
    guard: Awaited<ReturnType<typeof readGuard>>,
    scope: Scope,
    now: string,
  ) {
    transaction.set(guard.reference, {
      ...scope,
      professionalId: DEFAULT_PROFESSIONAL_ID,
      revision: guard.revision + 1,
      updatedAt: Timestamp.fromDate(new Date(now)),
    });
  }

  function replay<T>(
    snapshot: DocumentSnapshot,
    scope: Scope,
    fingerprint: string,
    decode: Decoder<T>,
  ): T {
    scopedData(snapshot, scope);
    if (snapshot.data()?.fingerprint !== fingerprint) {
      throw new AppointmentRuleError(
        "IDEMPOTENCY_CONFLICT",
        "A chave de requisição já foi utilizada com outro conteúdo.",
      );
    }
    return decode(snapshot, scope);
  }

  async function cancelRecord<T extends AgendaRecord>(
    collection: string,
    decode: Decoder<T>,
    salon: string,
    user: string,
    id: string,
  ): Promise<T> {
    const salonId = documentIdSchema.parse(salon);
    const userId = documentIdSchema.parse(user);
    const reference = firestore.collection(collection).doc(documentIdSchema.parse(id));
    // External read only locates the guard; status and returned data come from the transaction.
    const located = await reference.get();
    const location = located.data();
    if (
      !located.exists ||
      location?.salonId !== salonId ||
      location.professionalId !== DEFAULT_PROFESSIONAL_ID
    )
      notFound();
    const scope = { salonId, localDate: localDateSchema.parse(location.localDate) };
    const now = new Date().toISOString();
    return firestore.runTransaction(async (transaction) => {
      const guard = await readGuard(transaction, scope);
      const snapshot = await transaction.get(reference);
      const record = decode(snapshot, scope);
      if (record.status === "cancelled") return record;
      const cancelled = {
        ...record,
        status: "cancelled" as const,
        cancelledAt: now,
        updatedAt: now,
        updatedBy: userId,
      };
      // Update only cancellation fields: snapshots and original Timestamp precision remain intact.
      transaction.update(reference, {
        status: "cancelled",
        cancelledAt: Timestamp.fromDate(new Date(now)),
        updatedAt: Timestamp.fromDate(new Date(now)),
        updatedBy: userId,
      });
      writeGuard(transaction, guard, scope, now);
      return cancelled;
    });
  }

  return {
    async getAvailability(salon, query) {
      const salonId = documentIdSchema.parse(salon);
      const input = availabilityQuerySchema.parse(query);
      const [context, occupation] = await Promise.all([
        readServiceAndHours(salonId, input.serviceId),
        readDay({ salonId, localDate: input.date }),
      ]);
      return {
        date: input.date,
        timezone: BUSINESS_HOURS_TIME_ZONE,
        serviceId: input.serviceId,
        durationMinutes: context.service.durationMinutes,
        appointmentIntervalMinutes: context.businessHours.appointmentIntervalMinutes,
        windows: calculateAvailability({ date: input.date, ...context, ...occupation }),
      };
    },

    async getDay(salon, date) {
      const scope = {
        salonId: documentIdSchema.parse(salon),
        localDate: localDateSchema.parse(date),
      };
      return {
        date: scope.localDate,
        timezone: BUSINESS_HOURS_TIME_ZONE,
        ...(await readDay(scope)),
      };
    },

    async reserve(salon, user, value) {
      const salonId = documentIdSchema.parse(salon);
      const userId = documentIdSchema.parse(user);
      const input = createAppointmentInputSchema.parse(value);
      const scope = { salonId, localDate: getLocalDate(input.startAt) };
      const id = hash([salonId, "reserve", input.requestId]);
      const fingerprint = hash(input);
      const reference = firestore.collection("appointments").doc(id);
      const now = new Date().toISOString();
      return firestore.runTransaction(async (transaction) => {
        const guard = await readGuard(transaction, scope);
        const existing = await transaction.get(reference);
        if (existing.exists) {
          // Check ownership before fingerprints; a different date with this request is a conflict.
          const data = existing.data();
          if (data?.salonId !== salonId || data.professionalId !== DEFAULT_PROFESSIONAL_ID)
            notFound();
          if (data.fingerprint !== fingerprint)
            throw new AppointmentRuleError(
              "IDEMPOTENCY_CONFLICT",
              "A chave de requisição já foi utilizada com outro conteúdo.",
            );
          return {
            appointment: replay(existing, scope, fingerprint, decodeAppointment),
            replayed: true,
          };
        }
        const context = await readServiceAndHours(salonId, input.serviceId, transaction);
        const occupation = await readDay(scope, transaction);
        const appointment = buildAppointment({
          id,
          salonId,
          userId,
          input,
          ...context,
          ...occupation,
          now,
        });
        transaction.create(reference, storedRecord(appointment, fingerprint));
        writeGuard(transaction, guard, scope, now);
        return { appointment, replayed: false };
      });
    },

    cancel: (salonId, userId, id) =>
      cancelRecord("appointments", decodeAppointment, salonId, userId, id),

    async createBlock(salon, user, value) {
      const salonId = documentIdSchema.parse(salon);
      const userId = documentIdSchema.parse(user);
      const input = createTimeBlockInputSchema.parse(value);
      const scope = { salonId, localDate: getLocalDate(input.startAt) };
      const id = hash([salonId, "createBlock", input.requestId]);
      const fingerprint = hash(input);
      const reference = firestore.collection("timeBlocks").doc(id);
      const now = new Date().toISOString();
      return firestore.runTransaction(async (transaction) => {
        const guard = await readGuard(transaction, scope);
        const existing = await transaction.get(reference);
        if (existing.exists) {
          const data = existing.data();
          if (data?.salonId !== salonId || data.professionalId !== DEFAULT_PROFESSIONAL_ID)
            notFound();
          if (data.fingerprint !== fingerprint)
            throw new AppointmentRuleError(
              "IDEMPOTENCY_CONFLICT",
              "A chave de requisição já foi utilizada com outro conteúdo.",
            );
          return {
            timeBlock: replay(existing, scope, fingerprint, decodeTimeBlock),
            replayed: true,
          };
        }
        const occupation = await readDay(scope, transaction);
        const timeBlock = buildTimeBlock({ id, salonId, userId, input, ...occupation, now });
        transaction.create(reference, storedRecord(timeBlock, fingerprint));
        writeGuard(transaction, guard, scope, now);
        return { timeBlock, replayed: false };
      });
    },

    cancelBlock: (salonId, userId, id) =>
      cancelRecord("timeBlocks", decodeTimeBlock, salonId, userId, id),
  };
}
