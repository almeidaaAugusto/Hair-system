import { expect, test } from "@playwright/test";

test("exibe a página de verificação", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Fundação pronta" })).toBeVisible();
});

test("redireciona o acesso administrativo de serviços para o login", async ({ page }) => {
  await page.goto("/admin/services");

  await expect(page).toHaveURL(
    (url) => url.pathname === "/login" && url.searchParams.get("next") === "/admin/services",
  );
  await expect(page.getByRole("heading", { name: "Administração" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
});

test("redireciona o acesso administrativo de expediente para o login", async ({ page }) => {
  await page.goto("/admin/business-hours");

  await expect(page).toHaveURL(
    (url) => url.pathname === "/login" && url.searchParams.get("next") === "/admin/business-hours",
  );
  await expect(page.getByRole("heading", { name: "Administração" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
});

test("redireciona o acesso administrativo da agenda para o login", async ({ page }) => {
  await page.goto("/admin/agenda");

  await expect(page).toHaveURL(
    (url) => url.pathname === "/login" && url.searchParams.get("next") === "/admin/agenda",
  );
  await expect(page.getByRole("heading", { name: "Administração" })).toBeVisible();
});
