export type ClientLookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "found"; clientId: string; name: string }
  | { status: "not_found" }
  | { status: "error" };

/** A phone is worth looking up once it has 10-15 digits (canonical range). */
export function isLookupablePhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

export type ClientReference =
  { clientId: string } | { client: { name: string; phone: string } } | { error: string };

/**
 * Chooses how the booking identifies the client: an existing record
 * (`clientId`) or name + phone (the server creates/links the record). A failed
 * lookup never blocks booking.
 */
export function resolveClientReference(input: {
  phone: string;
  name: string;
  lookup: ClientLookupState;
}): ClientReference {
  if (!isLookupablePhone(input.phone)) return { error: "Informe o telefone com DDD." };
  if (input.lookup.status === "loading")
    return { error: "Aguarde a consulta da cliente pelo telefone." };
  if (input.lookup.status === "found") return { clientId: input.lookup.clientId };
  const name = input.name.trim();
  if (!name) return { error: "Informe o nome da cliente." };
  return { client: { name, phone: input.phone } };
}

/** The name field is only needed when no existing client was found. */
export function needsClientName(phone: string, lookup: ClientLookupState): boolean {
  return isLookupablePhone(phone) && lookup.status !== "found" && lookup.status !== "loading";
}

export type BookingAttempt = {
  /** Snapshot of the form this attempt was made from. */
  formKey: string;
  requestId: string;
  /** The exact client reference sent with `requestId`; retries must not change it. */
  reference: Exclude<ClientReference, { error: string }>;
};

/**
 * A retry of the same form (e.g. after a lost response) reuses the request id
 * and the client reference it was first sent with, so the idempotency
 * fingerprint never changes even if a later lookup now finds the new record.
 * Any edit to the form starts a fresh attempt with a new request id.
 */
export function resolveBookingAttempt(
  previous: BookingAttempt | undefined,
  formKey: string,
  resolveReference: () => ClientReference,
  newId: () => string,
): { attempt: BookingAttempt } | { error: string } {
  if (previous && previous.formKey === formKey) return { attempt: previous };
  const reference = resolveReference();
  if ("error" in reference) return { error: reference.error };
  return { attempt: { formKey, requestId: newId(), reference } };
}
