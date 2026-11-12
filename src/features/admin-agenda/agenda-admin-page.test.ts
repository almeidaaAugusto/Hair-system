import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) =>
    createElement("a", { href, ...props }, children),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/agenda",
  useRouter: () => ({ replace: vi.fn() }),
}));

import { AgendaAdminPage } from "./agenda-admin-page";
import { AppointmentForm, BlockForm, getBlockInterval } from "./agenda-forms";

describe("agenda page initial render", () => {
  it("starts on today's day view, loading, with navigation and actions", () => {
    const html = renderToStaticMarkup(createElement(AgendaAdminPage));

    expect(html).toContain("Carregando agenda…");
    expect(html).toMatch(/<a href="\/admin\/agenda" aria-current="page">Agenda<\/a>/);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Dia</);
    expect(html).toContain("Novo agendamento");
    expect(html).toContain("Bloquear horário");
    expect(html).not.toContain("Nenhum atendimento");
  });

  it("renders the appointment form waiting for services and a selection", () => {
    const html = renderToStaticMarkup(
      createElement(AppointmentForm, {
        defaultDate: "2026-11-12",
        onCancel: vi.fn(),
        onCreated: vi.fn(),
      }),
    );

    expect(html).toContain("Carregando serviços…");
    expect(html).toContain("Escolha o serviço e a data.");
    expect(html).toMatch(/<button disabled=""[^>]*type="submit"/);
  });

  it("renders the block form with a single-day hint", () => {
    const html = renderToStaticMarkup(
      createElement(BlockForm, {
        defaultDate: "2026-11-12",
        onCancel: vi.fn(),
        onCreated: vi.fn(),
      }),
    );
    expect(html).toContain("Bloqueios valem para um dia.");
    expect(html).toContain("Dia inteiro");
  });
});

describe("block form interval", () => {
  it("converts local times to UTC", () => {
    expect(
      getBlockInterval({
        date: "2026-11-12",
        wholeDay: false,
        startTime: "12:00",
        endTime: "13:30",
      }),
    ).toEqual({ startAt: "2026-11-12T15:00:00.000Z", endAt: "2026-11-12T16:30:00.000Z" });
  });

  it("covers the whole local day up to the next midnight", () => {
    expect(
      getBlockInterval({ date: "2026-11-12", wholeDay: true, startTime: "", endTime: "" }),
    ).toEqual({ startAt: "2026-11-12T03:00:00.000Z", endAt: "2026-11-13T03:00:00.000Z" });
  });

  it("rejects an end that is not after the start", () => {
    expect(
      getBlockInterval({
        date: "2026-11-12",
        wholeDay: false,
        startTime: "13:00",
        endTime: "13:00",
      }),
    ).toBe("O horário final deve ser depois do inicial.");
    expect(
      getBlockInterval({
        date: "2026-11-12",
        wholeDay: false,
        startTime: "14:00",
        endTime: "09:00",
      }),
    ).toMatch(/depois do inicial/);
  });

  it("rejects malformed dates and times", () => {
    expect(
      getBlockInterval({
        date: "2026-02-30",
        wholeDay: false,
        startTime: "09:00",
        endTime: "10:00",
      }),
    ).toBe("Confira a data e os horários informados.");
    expect(
      getBlockInterval({ date: "2026-11-12", wholeDay: false, startTime: "", endTime: "10:00" }),
    ).toBe("Confira a data e os horários informados.");
  });
});
