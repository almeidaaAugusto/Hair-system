import { describe, expect, it } from "vitest";

import { formatBrazilianReal, parseBrazilianRealToCents } from "./money";

describe("parseBrazilianRealToCents", () => {
  it("converts Brazilian currency text to integer cents without floating-point arithmetic", () => {
    expect(parseBrazilianRealToCents("1.234,56")).toBe(123_456);
  });

  it("accepts an integer amount and pads a single decimal place", () => {
    expect(parseBrazilianRealToCents("40,5")).toBe(4_050);
  });

  it("rejects malformed and out-of-range values", () => {
    expect(parseBrazilianRealToCents("12,345")).toBeUndefined();
    expect(parseBrazilianRealToCents("-1,00")).toBeUndefined();
    expect(parseBrazilianRealToCents("100.000,01")).toBeUndefined();
  });
});

describe("formatBrazilianReal", () => {
  it("formats integer cents for display", () => {
    expect(formatBrazilianReal(123_456)).toBe("R$ 1.234,56");
  });
});
