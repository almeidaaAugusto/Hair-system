import { describe, expect, it } from "vitest";

import { formatClientSummary, formatInstant, formatLocalDateBR } from "./client-summary";

describe("formatClientSummary", () => {
  it("formats counts, BRL amounts and Sao Paulo dates", () => {
    const items = formatClientSummary({
      completedCount: 3,
      noShowCount: 1,
      totalPaidCents: 123456,
      cancelledCount: 0,
      totalOutstandingCents: 2000,
      lastCompletedAt: "2026-11-10T12:00:00.000Z",
      nextConfirmedAt: "2026-11-20T01:30:00.000Z",
    });
    const byLabel = Object.fromEntries(items.map((item) => [item.label, item.value]));
    expect(byLabel["Atendimentos concluídos"]).toBe("3");
    expect(byLabel["Faltas"]).toBe("1");
    expect(byLabel["Total pago"]).toBe("R$ 1.234,56");
    expect(byLabel["Em aberto"]).toBe("R$ 20,00");
    expect(byLabel["Último atendimento"]).toBe("10/11/2026 às 09:00");
    // 01:30Z is still the previous day in Sao Paulo.
    expect(byLabel["Próximo atendimento"]).toBe("19/11/2026 às 22:30");
  });

  it("shows a dash when there is no last or next appointment", () => {
    const items = formatClientSummary({
      completedCount: 0,
      noShowCount: 0,
      totalPaidCents: 0,
      cancelledCount: 0,
      totalOutstandingCents: 0,
      lastCompletedAt: null,
      nextConfirmedAt: null,
    });
    expect(items.at(-2)?.value).toBe("—");
    expect(items.at(-1)?.value).toBe("—");
    expect(items[2]?.value).toBe("R$ 0,00");
  });
});

describe("date helpers", () => {
  it("formats instants and local dates", () => {
    expect(formatInstant("2026-11-13T15:00:00.000Z")).toBe("13/11/2026 às 12:00");
    expect(formatLocalDateBR("2026-01-05")).toBe("05/01/2026");
  });
});
