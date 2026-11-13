import { describe, expect, it } from "vitest";
import { birthdaySchema, daysInMonth, isLeapYear } from "./birthday";

describe("birthday", () => {
  it("knows leap years", () => {
    expect([2000, 2024, 1900, 2023].map(isLeapYear)).toEqual([true, true, false, false]);
    expect(daysInMonth(2, 2023)).toBe(28);
    expect(daysInMonth(2)).toBe(29);
    expect(daysInMonth(4)).toBe(30);
    expect(daysInMonth(12)).toBe(31);
  });

  it.each([
    { day: 1, month: 1 },
    { day: 31, month: 12, year: 1990 },
    { day: 29, month: 2 },
    { day: 29, month: 2, year: 2000 },
    { day: 28, month: 2, year: 2023 },
  ])("accepts %j", (value) => {
    expect(birthdaySchema.safeParse(value).success).toBe(true);
  });

  it.each([
    { day: 29, month: 2, year: 2023 },
    { day: 29, month: 2, year: 1900 },
    { day: 31, month: 4 },
    { day: 0, month: 1 },
    { day: 1, month: 13 },
    { day: 1, month: 1, year: 1899 },
    { day: 1, month: 1, year: 2101 },
    { day: 1.5, month: 1 },
    { day: 1, month: 1, extra: true },
  ])("rejects %j", (value) => {
    expect(birthdaySchema.safeParse(value).success).toBe(false);
  });
});
