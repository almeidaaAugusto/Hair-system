import type { ClientBirthday, ClientRecord } from "./client-types";

export type ClientFormFields = {
  name: string;
  phone: string;
  instagram: string;
  birthDay: string;
  birthMonth: string;
  birthYear: string;
  notes: string;
};

export const emptyClientFields: ClientFormFields = {
  name: "",
  phone: "",
  instagram: "",
  birthDay: "",
  birthMonth: "",
  birthYear: "",
  notes: "",
};

export function clientToFields(client: ClientRecord): ClientFormFields {
  return {
    name: client.name,
    phone: client.phone,
    instagram: client.instagram ?? "",
    birthDay: client.birthday ? String(client.birthday.day) : "",
    birthMonth: client.birthday ? String(client.birthday.month) : "",
    birthYear: client.birthday?.year ? String(client.birthday.year) : "",
    notes: client.notes ?? "",
  };
}

/** "@Maria.Silva" gives "maria.silva". Returns undefined when empty, null when invalid. */
export function parseInstagram(raw: string): string | undefined | null {
  const handle = raw.trim().replace(/^@/, "").toLowerCase();
  if (!handle) return undefined;
  return /^[a-z0-9._]{1,30}$/.test(handle) ? handle : null;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(month: number, year?: number): number {
  if (month === 2) return year === undefined || isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Day and month go together; year is optional. undefined = no birthday; string = message. */
export function parseBirthday(
  day: string,
  month: string,
  year: string,
  currentYear: number = new Date().getFullYear(),
): ClientBirthday | undefined | string {
  const d = day.trim();
  const m = month.trim();
  const y = year.trim();
  if (!d && !m && !y) return undefined;
  if (!/^\d{1,2}$/.test(d) || !/^\d{1,2}$/.test(m))
    return "Informe dia e mês do aniversário (o ano é opcional).";
  const dayNumber = Number(d);
  const monthNumber = Number(m);
  if (monthNumber < 1 || monthNumber > 12) return "O mês do aniversário deve ser de 1 a 12.";
  let yearNumber: number | undefined;
  if (y) {
    if (!/^\d{4}$/.test(y)) return "Informe o ano com 4 dígitos.";
    yearNumber = Number(y);
    if (yearNumber < 1900 || yearNumber > currentYear) return "Confira o ano do aniversário.";
  }
  if (dayNumber < 1 || dayNumber > daysInMonth(monthNumber, yearNumber))
    return "Esse dia não existe nesse mês.";
  return { day: dayNumber, month: monthNumber, ...(yearNumber ? { year: yearNumber } : {}) };
}

export type ClientCreatePayload = {
  name: string;
  phone: string;
  instagram?: string;
  birthday?: ClientBirthday;
  notes?: string;
};

export type ClientPatchPayload = {
  name?: string;
  phone?: string;
  instagram?: string | null;
  birthday?: ClientBirthday | null;
  notes?: string | null;
};

type Parsed = {
  name: string;
  phone: string;
  instagram: string | undefined;
  birthday: ClientBirthday | undefined;
  notes: string | undefined;
};

function parseFields(fields: ClientFormFields): Parsed | string {
  const name = fields.name.trim();
  if (!name) return "Informe o nome da cliente.";
  const digits = fields.phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return "Informe o telefone com DDD.";
  const instagram = parseInstagram(fields.instagram);
  if (instagram === null)
    return "Instagram inválido. Use só letras, números, ponto e sublinhado (até 30).";
  const birthday = parseBirthday(fields.birthDay, fields.birthMonth, fields.birthYear);
  if (typeof birthday === "string") return birthday;
  const notes = fields.notes.trim();
  return { name, phone: fields.phone.trim(), instagram, birthday, notes: notes || undefined };
}

export function buildCreatePayload(fields: ClientFormFields): ClientCreatePayload | string {
  const parsed = parseFields(fields);
  if (typeof parsed === "string") return parsed;
  return {
    name: parsed.name,
    phone: parsed.phone,
    ...(parsed.instagram ? { instagram: parsed.instagram } : {}),
    ...(parsed.birthday ? { birthday: parsed.birthday } : {}),
    ...(parsed.notes ? { notes: parsed.notes } : {}),
  };
}

/** Only changed fields; cleared optional fields are sent as null. */
export function buildPatchPayload(
  current: ClientRecord,
  fields: ClientFormFields,
): ClientPatchPayload | string {
  const parsed = parseFields(fields);
  if (typeof parsed === "string") return parsed;
  const patch: ClientPatchPayload = {};
  if (parsed.name !== current.name) patch.name = parsed.name;
  if (parsed.phone.replace(/\D/g, "") !== current.phone.replace(/\D/g, ""))
    patch.phone = parsed.phone;
  if (parsed.instagram !== current.instagram) patch.instagram = parsed.instagram ?? null;
  const before = current.birthday;
  const after = parsed.birthday;
  if (before?.day !== after?.day || before?.month !== after?.month || before?.year !== after?.year)
    patch.birthday = after ?? null;
  if (parsed.notes !== (current.notes?.trim() || undefined)) patch.notes = parsed.notes ?? null;
  return patch;
}

export type ChemicalEntryFields = {
  localDate: string;
  procedure: string;
  product: string;
  notes: string;
};

export type ChemicalEntryPayload = {
  localDate: string;
  procedure: string;
  product?: string;
  notes?: string;
};

export function buildChemicalEntryPayload(
  fields: ChemicalEntryFields,
): ChemicalEntryPayload | string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.localDate)) return "Informe a data do procedimento.";
  const procedure = fields.procedure.trim();
  if (!procedure) return "Informe o procedimento.";
  const product = fields.product.trim();
  const notes = fields.notes.trim();
  return {
    localDate: fields.localDate,
    procedure,
    ...(product ? { product } : {}),
    ...(notes ? { notes } : {}),
  };
}
