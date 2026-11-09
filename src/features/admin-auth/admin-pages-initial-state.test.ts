import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) =>
    createElement("a", { href, ...props }, children),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/services",
  useRouter: () => ({ replace: vi.fn() }),
}));

import { BusinessHoursAdminPage } from "@/features/admin-business-hours/business-hours-admin-page";
import { ServicesAdminPage } from "@/features/admin-services/services-admin-page";

describe("administrative page initial loading", () => {
  it("keeps service creation disabled until the initial GET completes", () => {
    const html = renderToStaticMarkup(createElement(ServicesAdminPage));

    expect(html).toContain('id="new-service" disabled=""');
    expect(html).toContain("Carregando serviços…");
  });

  it("disables business-hours editing while showing an accurate initial-load label", () => {
    const html = renderToStaticMarkup(createElement(BusinessHoursAdminPage));

    expect(html).toContain("Carregando expediente…");
    expect(html).toContain("Salvar expediente");
    expect(html).not.toContain("Salvando…");
    expect(html).toMatch(/name="appointmentIntervalMinutes"[^>]*disabled=""/);
  });
});
