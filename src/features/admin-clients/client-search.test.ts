import { describe, expect, it } from "vitest";

import {
  filterClients,
  formatBirthday,
  getCurrentMonth,
  getInstagramUrl,
  isBirthdayMonth,
  normalizeSearchText,
} from "./client-search";
import type { ClientListItem } from "./client-types";

const clients: ClientListItem[] = [
  { id: "1", name: "Maria José", phone: "5511988887777", instagram: "maria.jose" },
  { id: "2", name: "Ana Clara", phone: "5521977776666" },
  { id: "3", name: "JOÃO", phone: "5511955554444", instagram: "joao_hair" },
];

describe("filterClients", () => {
  it("keeps everyone for an empty or blank query", () => {
    expect(filterClients(clients, "")).toHaveLength(3);
    expect(filterClients(clients, "   ")).toHaveLength(3);
  });

  it("matches names without accents or case", () => {
    expect(filterClients(clients, "jose").map((c) => c.id)).toEqual(["1"]);
    expect(filterClients(clients, "joao").map((c) => c.id)).toEqual(["3"]);
    expect(filterClients(clients, "JOSÉ").map((c) => c.id)).toEqual(["1"]);
  });

  it("matches phone by digits regardless of mask", () => {
    expect(filterClients(clients, "(21) 97777").map((c) => c.id)).toEqual(["2"]);
    expect(filterClients(clients, "11 9").map((c) => c.id)).toEqual(["1", "3"]);
  });

  it("matches Instagram with or without @", () => {
    expect(filterClients(clients, "@joao_h").map((c) => c.id)).toEqual(["3"]);
    expect(filterClients(clients, "maria.j").map((c) => c.id)).toEqual(["1"]);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterClients(clients, "zzz")).toEqual([]);
  });
});

describe("birthday helpers", () => {
  it("normalizes text", () => {
    expect(normalizeSearchText("  ÁÉÍ Çã ")).toBe("aei ca");
  });

  it("flags only the matching month", () => {
    expect(isBirthdayMonth({ day: 5, month: 11 }, 11)).toBe(true);
    expect(isBirthdayMonth({ day: 5, month: 10 }, 11)).toBe(false);
    expect(isBirthdayMonth(undefined, 11)).toBe(false);
  });

  it("uses the Sao Paulo month, not UTC", () => {
    // 2026-12-01T01:00Z is still 30 Nov in Sao Paulo.
    expect(getCurrentMonth(new Date("2026-12-01T01:00:00Z"))).toBe(11);
    expect(getCurrentMonth(new Date("2026-12-01T04:00:00Z"))).toBe(12);
  });

  it("formats birthdays with and without year", () => {
    expect(formatBirthday({ day: 5, month: 3 })).toBe("05/03");
    expect(formatBirthday({ day: 5, month: 3, year: 1990 })).toBe("05/03/1990");
  });

  it("builds the Instagram link", () => {
    expect(getInstagramUrl("@maria.jose")).toBe("https://instagram.com/maria.jose");
  });
});

describe("displayPhone", () => {
  it("drops the 55 prefix and masks", async () => {
    const { displayPhone } = await import("./client-search");
    expect(displayPhone("5511988887777")).toBe("(11) 98888-7777");
    expect(displayPhone("551133334444")).toBe("(11) 3333-4444");
  });
});
