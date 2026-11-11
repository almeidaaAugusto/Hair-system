import { describe, expect, it } from "vitest";
import { getLocalDate, getLocalDayBounds, getLocalTimeInstant } from "./local-date";

describe("Sao Paulo calendar", () => {
  it("uses local date across UTC midnight and preserves historical offsets", () => {
    expect(getLocalDate("2026-11-11T02:59:59.999Z")).toBe("2026-11-10");
    expect(getLocalDate("2026-11-11T03:00:00.000Z")).toBe("2026-11-11");
    expect(getLocalDate("2018-11-05T02:00:00.000Z")).toBe("2018-11-05");
  });

  it.each([
    ["2026-11-11", "2026-11-11T03:00:00.000Z", "2026-11-12T03:00:00.000Z", 24],
    ["2018-11-04", "2018-11-04T03:00:00.000Z", "2018-11-05T02:00:00.000Z", 23],
    ["2019-02-16", "2019-02-16T02:00:00.000Z", "2019-02-17T03:00:00.000Z", 25],
    ["2024-02-29", "2024-02-29T03:00:00.000Z", "2024-03-01T03:00:00.000Z", 24],
  ])("finds real boundaries for %s", (date, startAt, endAt, hours) => {
    expect(getLocalDayBounds(date)).toEqual({ startAt, endAt });
    expect((Date.parse(endAt) - Date.parse(startAt)) / 3600000).toBe(hours);
  });

  it("does not invent nonexistent local times and resolves repeated local times explicitly", () => {
    expect(() => getLocalTimeInstant("2018-11-04", "00:30", "earlier")).toThrow();
    expect(getLocalTimeInstant("2018-11-04", "01:00", "earlier")).toBe("2018-11-04T03:00:00.000Z");
    expect(getLocalTimeInstant("2019-02-16", "23:30", "earlier")).toBe("2019-02-17T01:30:00.000Z");
    expect(getLocalTimeInstant("2019-02-16", "23:30", "later")).toBe("2019-02-17T02:30:00.000Z");
  });

  it("rejects invalid dates and UTC strings", () => {
    expect(() => getLocalDayBounds("2026-02-30")).toThrow();
    expect(() => getLocalDate("2026-02-30T12:00:00Z")).toThrow();
    expect(() => getLocalDate("invalid")).toThrow();
  });
});
