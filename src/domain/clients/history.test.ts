import { describe, expect, it } from "vitest";
import { summarizeClientHistory } from "./history";

const now = "2026-11-13T12:00:00.000Z";
type Item = Parameters<typeof summarizeClientHistory>[0][number];
const done = (startAt: string, finalPriceCents?: number, paidCents = 0): Item => ({
  status: "completed",
  startAt,
  ...(finalPriceCents === undefined
    ? {}
    : {
        payment: { finalPriceCents, paidCents, ...(paidCents ? { method: "pix" as const } : {}) },
      }),
});

describe("summarizeClientHistory", () => {
  it("returns zeros and nulls for an empty history", () => {
    expect(summarizeClientHistory([], now)).toEqual({
      completedCount: 0,
      noShowCount: 0,
      cancelledCount: 0,
      totalPaidCents: 0,
      totalOutstandingCents: 0,
      lastCompletedAt: null,
      nextConfirmedAt: null,
    });
  });

  it("sums paid and outstanding cents of completed appointments only", () => {
    const summary = summarizeClientHistory(
      [
        done("2026-10-01T12:00:00.000Z", 10000, 10000),
        done("2026-10-20T12:00:00.000Z", 8050, 3050),
        done("2026-10-25T12:00:00.000Z"),
        { status: "cancelled", startAt: "2026-10-26T12:00:00.000Z" },
        { status: "no_show", startAt: "2026-10-27T12:00:00.000Z" },
        { status: "no_show", startAt: "2026-10-28T12:00:00.000Z" },
      ],
      now,
    );
    expect(summary).toMatchObject({
      completedCount: 3,
      noShowCount: 2,
      cancelledCount: 1,
      totalPaidCents: 13050,
      totalOutstandingCents: 5000,
      lastCompletedAt: "2026-10-25T12:00:00.000Z",
    });
  });

  it("finds the last completed regardless of input order", () => {
    const summary = summarizeClientHistory(
      [done("2026-10-20T12:00:00.000Z", 1, 1), done("2026-11-01T12:00:00.000Z", 1, 1)],
      now,
    );
    expect(summary.lastCompletedAt).toBe("2026-11-01T12:00:00.000Z");
  });

  it("picks the earliest confirmed appointment not before now (boundary inclusive)", () => {
    const summary = summarizeClientHistory(
      [
        { status: "confirmed", startAt: "2026-11-13T11:59:00.000Z" },
        { status: "confirmed", startAt: "2026-11-20T12:00:00.000Z" },
        { status: "confirmed", startAt: now },
        { status: "cancelled", startAt: "2026-11-13T12:30:00.000Z" },
      ],
      now,
    );
    expect(summary.nextConfirmedAt).toBe(now);
    expect(
      summarizeClientHistory([{ status: "confirmed", startAt: "2026-11-13T11:59:00.000Z" }], now)
        .nextConfirmedAt,
    ).toBeNull();
  });
});
