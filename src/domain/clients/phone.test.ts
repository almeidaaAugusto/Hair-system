import { describe, expect, it } from "vitest";
import { normalizeBrazilianPhone } from "./phone";

describe("normalizeBrazilianPhone", () => {
  it.each([
    ["11999991234", "5511999991234"],
    ["(11) 99999-1234", "5511999991234"],
    ["+55 (11) 99999-1234", "5511999991234"],
    ["5511999991234", "5511999991234"],
    ["1133334444", "551133334444"],
    ["551133334444", "551133334444"],
    ["+44 20 7946 0958", "442079460958"],
    ["351912345678", "351912345678"],
  ])("canonicalizes %s", (raw, expected) => {
    expect(normalizeBrazilianPhone(raw)).toBe(expected);
  });

  it("treats every Brazilian format of the same number as one key", () => {
    const formats = ["11999991234", "(11) 99999-1234", "55 11 99999-1234", "+5511999991234"];
    expect(new Set(formats.map(normalizeBrazilianPhone)).size).toBe(1);
  });

  it.each(["", "abc", "123456789", "1234567890123456", "99999-123"])("rejects %s", (raw) => {
    expect(normalizeBrazilianPhone(raw)).toBeNull();
  });

  it("accepts the length boundaries 10 and 15 and rejects 9 and 16", () => {
    expect(normalizeBrazilianPhone("1".repeat(10))).toBe(`55${"1".repeat(10)}`);
    expect(normalizeBrazilianPhone("1".repeat(15))).toBe("1".repeat(15));
    expect(normalizeBrazilianPhone("1".repeat(9))).toBeNull();
    expect(normalizeBrazilianPhone("1".repeat(16))).toBeNull();
  });
});
