import { z } from "zod";
import { documentIdSchema, localDateSchema, utcInstantSchema } from "../appointments/appointment";
import { birthdaySchema } from "./birthday";
import { normalizeInstagram } from "./instagram";
import { normalizeBrazilianPhone } from "./phone";

export const MAX_CHEMICAL_HISTORY_ENTRIES = 100;
export const MAX_CLIENT_NOTES_LENGTH = 2000;
export const MAX_LISTED_CLIENTS = 2000;

/** Accepts any common phone format and yields the canonical phone key. */
export const clientPhoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[\d\s().-]+$/)
  .refine((phone) => normalizeBrazilianPhone(phone) !== null, "Telefone inválido.")
  .transform((phone) => normalizeBrazilianPhone(phone) as string);

export const instagramSchema = z
  .string()
  .refine((value) => normalizeInstagram(value) !== null, "Instagram inválido.")
  .transform((value) => normalizeInstagram(value) as string);

const nameSchema = z.string().trim().min(1).max(120);
const notesSchema = z.string().trim().max(MAX_CLIENT_NOTES_LENGTH);

export const chemicalEntryInputSchema = z
  .object({
    requestId: z.uuid(),
    localDate: localDateSchema,
    procedure: z.string().trim().min(1).max(120),
    product: z.string().trim().min(1).max(120).optional(),
    notes: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
export type ChemicalEntryInput = z.infer<typeof chemicalEntryInputSchema>;

export const chemicalEntrySchema = z
  .object({
    id: documentIdSchema,
    localDate: localDateSchema,
    procedure: z.string().min(1).max(120),
    product: z.string().min(1).max(120).optional(),
    notes: z.string().min(1).max(500).optional(),
  })
  .strict();
export type ChemicalEntry = z.infer<typeof chemicalEntrySchema>;

export const createClientInputSchema = z
  .object({
    requestId: z.uuid(),
    name: nameSchema,
    phone: clientPhoneSchema,
    instagram: instagramSchema.optional(),
    birthday: birthdaySchema.optional(),
    notes: notesSchema.optional(),
  })
  .strict();
export type CreateClientInput = z.infer<typeof createClientInputSchema>;

/** Partial update; `null` clears an optional field. */
export const updateClientInputSchema = z
  .object({
    name: nameSchema.optional(),
    phone: clientPhoneSchema.optional(),
    instagram: instagramSchema.nullable().optional(),
    birthday: birthdaySchema.nullable().optional(),
    notes: notesSchema.nullable().optional(),
  })
  .strict()
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: "Informe ao menos um campo.",
  });
export type UpdateClientInput = z.infer<typeof updateClientInputSchema>;

export const clientRecordSchema = z
  .object({
    id: documentIdSchema,
    salonId: documentIdSchema,
    name: nameSchema,
    phone: z.string().regex(/^\d{10,15}$/),
    instagram: z
      .string()
      .regex(/^[a-z0-9._]{1,30}$/)
      .optional(),
    birthday: birthdaySchema.optional(),
    notes: z.string().max(MAX_CLIENT_NOTES_LENGTH).optional(),
    chemicalHistory: z.array(chemicalEntrySchema).max(MAX_CHEMICAL_HISTORY_ENTRIES),
    createdAt: utcInstantSchema,
    updatedAt: utcInstantSchema,
    createdBy: documentIdSchema,
    updatedBy: documentIdSchema,
  })
  .strict();
export type ClientRecord = z.infer<typeof clientRecordSchema>;

export type ClientListItem = Pick<ClientRecord, "id" | "name" | "phone" | "instagram" | "birthday">;

export const clientLookupQuerySchema = z.object({ phone: clientPhoneSchema }).strict();

export type ClientRuleErrorCode =
  "NOT_FOUND" | "CLIENT_PHONE_TAKEN" | "IDEMPOTENCY_CONFLICT" | "CHEMICAL_HISTORY_FULL";

export class ClientRuleError extends Error {
  constructor(
    public readonly code: ClientRuleErrorCode,
    message: string,
    /** For CLIENT_PHONE_TAKEN: the client that already owns the phone. */
    public readonly clientId?: string,
  ) {
    super(message);
    this.name = "ClientRuleError";
  }
}
