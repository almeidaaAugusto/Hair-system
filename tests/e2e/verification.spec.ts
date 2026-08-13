import { expect, test } from "@playwright/test";

test("exibe a página de verificação", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Fundação pronta" })).toBeVisible();
});

test("exibe o acesso administrativo de serviços", async ({ page }) => {
  await page.goto("/admin/services");

  await expect(page.getByRole("heading", { name: "Administração" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
});

test("exibe o acesso administrativo de expediente", async ({ page }) => {
  await page.goto("/admin/business-hours");

  await expect(page.getByRole("heading", { name: "Administração" })).toBeVisible();
  await expect(page.getByText("Entre para configurar o expediente semanal.")).toBeVisible();
});
