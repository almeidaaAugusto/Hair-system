import { createHash } from "node:crypto";
import {
  FieldValue,
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
  completeAppointmentInputSchema,
  createAppointmentInputSchema,
  createTimeBlockInputSchema,
  documentIdSchema,
  paymentSchema,
  rescheduleInputSchema,
  localDateSchema,
  rangeQuerySchema,
  timeBlockSchema,
  type Appointment,
  type TimeBlock,
} from "@/domain/appointments/appointment";
import {
  assertCancellable,
  completeAppointment,
  markClientConfirmed,
  markNoShow,
  markReminderSent,
  recordPayment,
  type AppointmentChange,
} from "@/domain/appointments/attendance";
import {
  buildAppointment,
  buildTimeBlock,
  calculateAvailability,
  rescheduleAppointment,
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
  "completedAt",
  "noShowAt",
  "paymentUpdatedAt",
  "reminderSentAt",
  "clientConfirmedAt",
];

/** Firestore update for the given fields; absent optional fields are removed. */
function toPatch(record: Appointment, keys: readonly (keyof Appointment)[]): DocumentData {
  const patch: DocumentData = {};
  for (const key of keys) {
    const value = record[key];
    patch[key] =
      value === undefined
        ? FieldValue.delete()
        : typeof value === "string" && instantFields.includes(key)
          ? Timestamp.fromDate(new Date(value))
          : value;
  }
  return patch;
}

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
    const [serviceSnapshot, businessHours] = transaction
      ? [await transaction.get(serviceRef), await readHours(salonId, transaction)]
      : await Promise.all([serviceRef.get(), readHours(salonId)]);
    const serviceData = serviceSnapshot.data();
    if (!serviceSnapshot.exists || serviceData?.salonId !== salonId) notFound();
    const service = { ...createServiceSchema.strip().parse(serviceData), id: serviceId, salonId };
    return { service, businessHours };
  }

  async function readHours(salonId: string, transaction?: Transaction) {
    const hoursRef = firestore
      .collection("businessHours")
      .doc(businessHoursDocumentId(salonId, DEFAULT_PROFESSIONAL_ID));
    const hoursSnapshot = transaction ? await transaction.get(hoursRef) : await hoursRef.get();
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
    return businessHours;
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
    const data = snapshot.data();
    if (data?.salonId !== scope.salonId || data.professionalId !== DEFAULT_PROFESSIONAL_ID)
      notFound();
    // Compare content before decoding the date: a changed date is an idempotency conflict.
    if (data.fingerprint !== fingerprint) {
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
    precondition: (record: T) => void = () => {},
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
      precondition(record);
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

  /**
   * Attendance commands change neither the occupied period nor the day's
   * occupation, so they serialize on the appointment document alone; a
   * concurrent cancellation also reads and writes that document.
   */
  async function transitionAppointment(
    salon: string,
    user: string,
    id: string,
    transition: (
      appointment: Appointment,
      actor: { userId: string; now: string },
    ) => AppointmentChange | null,
  ): Promise<Appointment> {
    const salonId = documentIdSchema.parse(salon);
    const userId = documentIdSchema.parse(user);
    const reference = firestore.collection("appointments").doc(documentIdSchema.parse(id));
    const now = new Date().toISOString();
    return firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      const location = snapshot.data();
      if (
        !snapshot.exists ||
        location?.salonId !== salonId ||
        location.professionalId !== DEFAULT_PROFESSIONAL_ID
      )
        notFound();
      const appointment = decodeAppointment(snapshot, {
        salonId,
        localDate: localDateSchema.parse(location.localDate),
      });
      const change = transition(appointment, { userId, now });
      if (!change) return appointment;
      transaction.update(reference, toPatch(change.appointment, change.changed));
      return change.appointment;
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
        windows: calculateAvailability({
          date: input.date,
          ...context,
          timeBlocks: occupation.timeBlocks,
          appointments: occupation.appointments.filter(
            (appointment) => appointment.id !== input.excludeAppointmentId,
          ),
        }),
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

    async getRange(salon, fromValue, toValue) {
      const salonId = documentIdSchema.parse(salon);
      const { from, to } = rangeQuerySchema.parse({ from: fromValue, to: toValue });
      const rangeQuery = (collection: string) =>
        firestore
          .collection(collection)
          .where("salonId", "==", salonId)
          .where("professionalId", "==", DEFAULT_PROFESSIONAL_ID)
          .where("localDate", ">=", from)
          .where("localDate", "<=", to)
          .orderBy("localDate", "asc")
          .orderBy("startAt", "asc");
      const [appointments, blocks] = await Promise.all([
        rangeQuery("appointments").get(),
        rangeQuery("timeBlocks").get(),
      ]);
      // Each record is decoded against its own day so the stored date stays verified.
      const decodeEach = <T>(snapshot: DocumentSnapshot, decode: Decoder<T>) => {
        const localDate = localDateSchema.parse(snapshot.get("localDate"));
        if (localDate < from || localDate > to) notFound();
        return decode(snapshot, { salonId, localDate });
      };
      return {
        from,
        to,
        timezone: BUSINESS_HOURS_TIME_ZONE,
        appointments: appointments.docs.map((document) => decodeEach(document, decodeAppointment)),
        timeBlocks: blocks.docs.map((document) => decodeEach(document, decodeTimeBlock)),
      };
    },

    async reserve(salon, user, value) {
      const salonId = documentIdSchema.parse(salon);
      const userId = documentIdSchema.parse(user);
      const input = createAppointmentInputSchema.parse(value);
      const scope = { salonId, localDate: getLocalDate(input.startAt) };
      const id = hash([salonId, "reserve", input.requestId]);
      // Requests without exceptions keep the fingerprint they always had.
      const { allowExceptions, ...withoutExceptions } = input;
      const fingerprint = hash(allowExceptions === true ? input : withoutExceptions);
      const reference = firestore.collection("appointments").doc(id);
      const now = new Date().toISOString();
      return firestore.runTransaction(async (transaction) => {
        const guard = await readGuard(transaction, scope);
        const existing = await transaction.get(reference);
        if (existing.exists) {
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
      cancelRecord("appointments", decodeAppointment, salonId, userId, id, assertCancellable),

    complete: (salonId, userId, id, value) => {
      const input = completeAppointmentInputSchema.parse(value);
      return transitionAppointment(salonId, userId, id, (appointment, actor) =>
        completeAppointment(appointment, actor, input.payment),
      );
    },

    async reschedule(salon, user, id, value) {
      const salonId = documentIdSchema.parse(salon);
      const userId = documentIdSchema.parse(user);
      const input = rescheduleInputSchema.parse(value);
      const reference = firestore.collection("appointments").doc(documentIdSchema.parse(id));
      // External read only locates the current day; everything is revalidated below.
      const located = await reference.get();
      const location = located.data();
      if (
        !located.exists ||
        location?.salonId !== salonId ||
        location.professionalId !== DEFAULT_PROFESSIONAL_ID
      )
        notFound();
      const fromScope = { salonId, localDate: localDateSchema.parse(location.localDate) };
      const toScope = { salonId, localDate: getLocalDate(input.startAt) };
      const scopes = [fromScope, toScope]
        .filter(
          (scope, index, all) => all.findIndex((s) => s.localDate === scope.localDate) === index,
        )
        .sort((a, b) => a.localDate.localeCompare(b.localDate));
      const now = new Date().toISOString();
      return firestore.runTransaction(async (transaction) => {
        // Both day guards are read first, in a fixed order, before any other read.
        const guards = [];
        for (const scope of scopes)
          guards.push({ scope, guard: await readGuard(transaction, scope) });
        const snapshot = await transaction.get(reference);
        if (snapshot.get("localDate") !== fromScope.localDate)
          throw new AppointmentRuleError(
            "CONFLICT",
            "O atendimento foi alterado em paralelo. Atualize a agenda.",
          );
        const appointment = decodeAppointment(snapshot, fromScope);
        const changesService =
          input.serviceId !== undefined &&
          input.serviceId !== appointment.serviceSnapshot.serviceId;
        const context = changesService
          ? await readServiceAndHours(salonId, input.serviceId!, transaction)
          : { businessHours: await readHours(salonId, transaction) };
        const occupation = await readDay(toScope, transaction);
        const moved = rescheduleAppointment(appointment, {
          ...context,
          ...occupation,
          startAt: input.startAt,
          allowExceptions: input.allowExceptions === true,
          userId,
          now,
        });
        if (!moved) return appointment;
        const patch = toPatch(moved, [
          "localDate",
          "startAt",
          "endAt",
          "occupiedUntilAt",
          "serviceSnapshot",
          "appointmentIntervalMinutes",
          "exceptions",
          "reminderSentAt",
          "clientConfirmedAt",
          "updatedAt",
          "updatedBy",
        ]);
        transaction.update(reference, patch);
        for (const { scope, guard } of guards) writeGuard(transaction, guard, scope, now);
        return moved;
      });
    },

    markReminderSent: (salonId, userId, id) =>
      transitionAppointment(salonId, userId, id, (appointment, actor) =>
        markReminderSent(appointment, actor),
      ),

    markClientConfirmed: (salonId, userId, id) =>
      transitionAppointment(salonId, userId, id, (appointment, actor) =>
        markClientConfirmed(appointment, actor),
      ),

    markNoShow: (salonId, userId, id) =>
      transitionAppointment(salonId, userId, id, (appointment, actor) =>
        markNoShow(appointment, actor),
      ),

    recordPayment: (salonId, userId, id, value) => {
      const payment = paymentSchema.parse(value);
      return transitionAppointment(salonId, userId, id, (appointment, actor) =>
        recordPayment(appointment, payment, actor),
      );
    },

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
