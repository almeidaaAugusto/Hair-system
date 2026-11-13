import { formatPhone, getTodayLocalDate } from "@/features/admin-agenda/agenda-calendar";

import type { ClientBirthday, ClientListItem } from "./client-types";

/** Lowercase, accent-free, trimmed text used for name matching. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * One search box: name (no accents/case), phone (digits only) or Instagram
 * (with or without "@"). An empty query keeps everyone.
 */
export function filterClients(clients: ClientListItem[], query: string): ClientListItem[] {
  const text = normalizeSearchText(query);
  if (!text) return clients;
  const digits = query.replace(/\D/g, "");
  const handle = text.replace(/^@/, "");
  return clients.filter(
    (client) =>
      normalizeSearchText(client.name).includes(text) ||
      (digits.length > 0 && client.phone.replace(/\D/g, "").includes(digits)) ||
      (handle.length > 0 && (client.instagram ?? "").toLowerCase().includes(handle)),
  );
}

/** Month (1-12) of a YYYY-MM-DD local date. */
export function monthOfLocalDate(localDate: string): number {
  return Number(localDate.slice(5, 7));
}

/** Current month in America/Sao_Paulo. */
export function getCurrentMonth(now: Date = new Date()): number {
  return monthOfLocalDate(getTodayLocalDate(now));
}

export function isBirthdayMonth(birthday: ClientBirthday | undefined, month: number): boolean {
  return birthday !== undefined && birthday.month === month;
}

const two = (value: number) => String(value).padStart(2, "0");

/** "05/03" or "05/03/1990". */
export function formatBirthday(birthday: ClientBirthday): string {
  const base = `${two(birthday.day)}/${two(birthday.month)}`;
  return birthday.year ? `${base}/${birthday.year}` : base;
}

export function getInstagramUrl(handle: string): string {
  return `https://instagram.com/${encodeURIComponent(handle.replace(/^@/, ""))}`;
}

/** Phone for display: drops the Brazilian country code kept in the canonical key. */
export function displayPhone(phone: string): string {
  return formatPhone(phone);
}
