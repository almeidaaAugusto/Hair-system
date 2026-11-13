import { formatLocalTime } from "@/features/admin-agenda/agenda-calendar";
import { formatBrazilianReal } from "@/features/admin-services/money";

import type { ClientSummary } from "./client-types";

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** "13/11/2026 às 09:00" in America/Sao_Paulo. */
export function formatInstant(instant: string): string {
  return `${dateFormat.format(new Date(instant))} às ${formatLocalTime(instant)}`;
}

/** "13/11/2026" from a YYYY-MM-DD local date. */
export function formatLocalDateBR(localDate: string): string {
  return `${localDate.slice(8, 10)}/${localDate.slice(5, 7)}/${localDate.slice(0, 4)}`;
}

function formatRef(instant: string | null | undefined): string {
  return instant ? formatInstant(instant) : "—";
}

export type SummaryItem = { label: string; value: string };

export function formatClientSummary(summary: ClientSummary): SummaryItem[] {
  return [
    { label: "Atendimentos concluídos", value: String(summary.completedCount) },
    { label: "Faltas", value: String(summary.noShowCount) },
    { label: "Total pago", value: formatBrazilianReal(summary.totalPaidCents) },
    { label: "Em aberto", value: formatBrazilianReal(summary.totalOutstandingCents) },
    { label: "Último atendimento", value: formatRef(summary.lastCompletedAt) },
    { label: "Próximo atendimento", value: formatRef(summary.nextConfirmedAt) },
  ];
}
