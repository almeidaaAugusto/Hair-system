import { describe, expect, it } from "vitest";
import { normalizeInstagram } from "./instagram";

describe("normalizeInstagram", () => {
  it.each([
    ["@Gabi.Hair", "gabi.hair"],
    ["  gabi_hair  ", "gabi_hair"],
    ["https://www.instagram.com/Gabi.Hair/", "gabi.hair"],
    ["instagram.com/gabi.hair?igsh=abc", "gabi.hair"],
    ["a", "a"],
    ["a".repeat(30), "a".repeat(30)],
  ])("normalizes %s", (raw, expected) => {
    expect(normalizeInstagram(raw)).toBe(expected);
  });

  it.each(["", "@", "a".repeat(31), "gabi hair", "gabi-hair", "@@gabi", "gaçi"])(
    "rejects %s",
    (raw) => {
      expect(normalizeInstagram(raw)).toBeNull();
    },
  );
});
