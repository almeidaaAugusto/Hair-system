import { describe, expect, it } from "vitest";

import { countLocalDays, MAX_AGENDA_RANGE_DAYS } from "@/domain/appointments/appointment";

import {
  addDays,
  addMonths,
  formatAgendaTitle,
  formatLocalTime,
  formatPhone,
  getAgendaErrorMessage,
  getAgendaRange,
  getTodayLocalDate,
  getWhatsAppUrl,
  groupByLocalDate,
  listDates,
  listStartOptions,
  localDateTimeToUtc,
  shiftAgendaDate,
  startOfWeek,
} from "./agenda-calendar";

describe("agenda calendar arithmetic", () => {
  it("adds days across month, year and leap-day boundaries", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("clamps month shifts to the last day of the target month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
  });

  it("starts weeks on Monday", () => {
    expect(startOfWeek("2026-11-12")).toBe("2026-11-09");
    expect(startOfWeek("2026-11-09")).toBe("2026-11-09");
    expect(startOfWeek("2026-11-15")).toBe("2026-11-09");
  });

  it("builds day, week and month ranges", () => {
    expect(getAgendaRange("day", "2026-11-12")).toEqual({ from: "2026-11-12", to: "2026-11-12" });
    expect(getAgendaRange("week", "2026-11-12")).toEqual({
      from: "2026-11-09",
      to: "2026-11-15",
    });
    expect(getAgendaRange("month", "2026-11-12")).toEqual({
      from: "2026-10-26",
      to: "2026-12-06",
    });
  });

  it("keeps every month grid within the API range limit", () => {
    for (let month = 0; month < 120; month++) {
      const date = addMonths("2026-01-01", month);
      const range = getAgendaRange("month", date);
      const days = countLocalDays(range.from, range.to);
      expect(days % 7).toBe(0);
      expect(days).toBeLessThanOrEqual(MAX_AGENDA_RANGE_DAYS);
      expect(range.from <= date && date <= range.to).toBe(true);
      expect(listDates(range)).toHaveLength(days);
    }
  });

  it("navigates by view", () => {
    expect(shiftAgendaDate("day", "2026-11-12", 1)).toBe("2026-11-13");
    expect(shiftAgendaDate("week", "2026-11-12", -1)).toBe("2026-11-05");
    expect(shiftAgendaDate("month", "2026-11-12", 1)).toBe("2026-12-12");
  });
});

describe("agenda time zone handling", () => {
  it("uses the São Paulo date for today", () => {
    expect(getTodayLocalDate(new Date("2026-11-13T02:30:00Z"))).toBe("2026-11-12");
    expect(getTodayLocalDate(new Date("2026-11-13T03:00:00Z"))).toBe("2026-11-13");
  });

  it("converts local wall-clock time to UTC and back", () => {
    const instant = localDateTimeToUtc("2026-11-12", "09:00");
    expect(instant).toBe("2026-11-12T12:00:00.000Z");
    expect(formatLocalTime(instant)).toBe("09:00");
  });

  it("formats titles in Portuguese", () => {
    expect(formatAgendaTitle("month", "2026-11-12")).toMatch(/novembro de 2026/);
    expect(formatAgendaTitle("day", "2026-11-12")).toMatch(/quinta-feira/);
    expect(formatAgendaTitle("week", "2026-11-12")).toContain(" a ");
  });
});

describe("start options", () => {
  it("lists the first minute and aligned steps up to the latest start", () => {
    expect(
      listStartOptions([
        {
          startAt: "2026-11-12T12:00:00.000Z",
          endAt: "2026-11-12T13:40:00.000Z",
          latestStartAt: "2026-11-12T12:30:00.000Z",
        },
        {
          startAt: "2026-11-12T14:10:00.000Z",
          endAt: "2026-11-12T15:20:00.000Z",
          latestStartAt: "2026-11-12T14:10:00.000Z",
        },
      ]),
    ).toEqual([
      "2026-11-12T12:00:00.000Z",
      "2026-11-12T12:15:00.000Z",
      "2026-11-12T12:30:00.000Z",
      "2026-11-12T14:10:00.000Z",
    ]);
  });

  it("returns nothing without free windows", () => {
    expect(listStartOptions([])).toEqual([]);
  });
});

describe("agenda helpers", () => {
  it("builds WhatsApp links with the Brazilian country code when missing", () => {
    expect(getWhatsAppUrl("11999999999")).toBe("https://wa.me/5511999999999");
    expect(getWhatsAppUrl("5511999999999")).toBe("https://wa.me/5511999999999");
  });

  it("formats Brazilian phone numbers", () => {
    expect(formatPhone("11999999999")).toBe("(11) 99999-9999");
    expect(formatPhone("1133334444")).toBe("(11) 3333-4444");
    expect(formatPhone("5511999999999")).toBe("5511999999999");
  });

  it("maps rule codes to friendly messages and falls back safely", () => {
    expect(getAgendaErrorMessage({ code: "CONFLICT" }, "x")).toMatch(/ocupado/);
    expect(getAgendaErrorMessage({ error: "Dados inválidos." }, "x")).toBe("Dados inválidos.");
    expect(getAgendaErrorMessage({ code: "toString" }, "x")).toBe("x");
    expect(getAgendaErrorMessage(null, "x")).toBe("x");
  });

  it("groups records by local date preserving order", () => {
    const groups = groupByLocalDate([
      { id: "a", localDate: "2026-11-12" },
      { id: "b", localDate: "2026-11-13" },
      { id: "c", localDate: "2026-11-12" },
    ]);
    expect(groups.get("2026-11-12")?.map((record) => record.id)).toEqual(["a", "c"]);
    expect(groups.get("2026-11-13")?.map((record) => record.id)).toEqual(["b"]);
  });
});
