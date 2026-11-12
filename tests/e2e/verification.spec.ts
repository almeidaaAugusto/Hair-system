import { expect, test } from "@playwright/test";

test("exibe a página inicial da profissional", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Gabriela Alvim" })).toBeVisible();
  await expect(page.getByText("Saúde capilar começa no couro cabeludo")).toBeVisible();
  await expect(page.getByRole("link", { name: "Fale comigo no Instagram" })).toHaveAttribute(
    "href",
    "https://www.instagram.com/gabrielaalvim.terapeuta/",
  );

  await page.getByRole("link", { name: "Área da profissional" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/login");
  await expect(page.getByRole("heading", { name: "Administração" })).toBeVisible();
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
