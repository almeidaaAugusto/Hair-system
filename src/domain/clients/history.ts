import type { Appointment } from "../appointments/appointment";

export type ClientHistorySummary = {
  completedCount: number;
  noShowCount: number;
  cancelledCount: number;
  /** Sum of paidCents of completed appointments. */
  totalPaidCents: number;
  /** Sum of finalPriceCents - paidCents of completed appointments with a recorded payment. */
  totalOutstandingCents: number;
  /** startAt (UTC) of the most recent completed appointment. */
  lastCompletedAt: string | null;
  /** startAt (UTC) of the earliest confirmed appointment not before `now`. */
  nextConfirmedAt: string | null;
};

type HistoryItem = Pick<Appointment, "status" | "startAt" | "payment">;

/** Summarizes a client's appointments. Only completed appointments count as money. */
export function summarizeClientHistory(
  appointments: readonly HistoryItem[],
  now: string,
): ClientHistorySummary {
  const nowMs = Date.parse(now);
  const summary: ClientHistorySummary = {
    completedCount: 0,
    noShowCount: 0,
    cancelledCount: 0,
    totalPaidCents: 0,
    totalOutstandingCents: 0,
    lastCompletedAt: null,
    nextConfirmedAt: null,
  };
  for (const { status, startAt, payment } of appointments) {
    if (status === "completed") {
      summary.completedCount++;
      if (payment) {
        summary.totalPaidCents += payment.paidCents;
        summary.totalOutstandingCents += payment.finalPriceCents - payment.paidCents;
      }
      if (!summary.lastCompletedAt || Date.parse(startAt) > Date.parse(summary.lastCompletedAt))
        summary.lastCompletedAt = startAt;
    } else if (status === "no_show") summary.noShowCount++;
    else if (status === "cancelled") summary.cancelledCount++;
    else if (
      status === "confirmed" &&
      Date.parse(startAt) >= nowMs &&
      (!summary.nextConfirmedAt || Date.parse(startAt) < Date.parse(summary.nextConfirmedAt))
    )
      summary.nextConfirmedAt = startAt;
  }
  return summary;
}
