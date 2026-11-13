import type { Appointment } from "@/domain/appointments/appointment";
import type { ClientHistorySummary } from "@/domain/clients/history";

/**
 * Local shapes of the clients API responses (contract: client-registry spec).
 * They are intentionally independent from the server types; the lead aligns
 * them with the domain schemas later.
 */
export type ClientBirthday = { day: number; month: number; year?: number };

export type ClientListItem = {
  id: string;
  name: string;
  phone: string;
  instagram?: string;
  birthday?: ClientBirthday;
};

export type ChemicalHistoryEntry = {
  id: string;
  localDate: string;
  procedure: string;
  product?: string;
  notes?: string;
};

export type ClientRecord = ClientListItem & {
  notes?: string;
  chemicalHistory: ChemicalHistoryEntry[];
};

export type ClientSummary = ClientHistorySummary;

export type ClientDetail = {
  client: ClientRecord;
  appointments: Appointment[];
  summary: ClientSummary;
};

export type ClientApiErrorBody = { code?: string; error?: string; clientId?: string };
