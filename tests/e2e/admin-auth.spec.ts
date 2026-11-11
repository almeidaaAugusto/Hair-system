import { expect, test, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

const password = "senha-segura";
const runId = randomUUID();
const salonId = `auth-e2e-salon-${runId}`;
const accounts = {
  admin: `admin-${runId}@example.test`,
  nonAdmin: `non-admin-${runId}@example.test`,
  missingSalon: `missing-salon-${runId}@example.test`,
};
let app: App | undefined;
let adminAuth: Auth;
const userIds: string[] = [];

test.beforeAll(async () => {
  // Refuse to provision identities unless both local emulators are explicit.
  for (const [name, port] of [
    ["FIREBASE_AUTH_EMULATOR_HOST", "9098"],
    ["FIRESTORE_EMULATOR_HOST", "8085"],
  ]) {
    const host = process.env[name];
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
      throw new Error(`Auth E2E requires the local ${name}; use npm run test:e2e:auth.`);
    }
  }
  app = initializeApp({ projectId: "demo-sistema-cabelo" }, `auth-e2e-${runId}`);
  adminAuth = getAuth(app);
  for (const [role, email] of Object.entries(accounts)) {
    const user = await adminAuth.createUser({ email, password });
    userIds.push(user.uid);
    const claims =
      role === "admin"
        ? { admin: true, salonId }
        : role === "missingSalon"
          ? { admin: true }
          : { salonId };
    await adminAuth.setCustomUserClaims(user.uid, claims);
  }
});

test.afterAll(async () => {
  if (!app) return;
  try {
    if (userIds.length > 0) await adminAuth.deleteUsers(userIds);
  } finally {
    await deleteApp(app);
  }
});

async function submitLogin(page: Page, email = accounts.admin, loginPassword = password) {
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(loginPassword);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await Promise.all([page.waitForURL("**/admin/services"), submitLogin(page)]);
  await expect(page).toHaveURL(/\/admin\/services$/);
  await expect(page.getByRole("heading", { name: "Serviços", exact: true })).toBeVisible();
}

test("persists the same five-day session across navigation and refresh", async ({
  page,
  context,
}) => {
  const startedAt = Date.now() / 1000;
  await loginAsAdmin(page);
  const session = (await context.cookies()).find((cookie) => cookie.name === "admin_session");
  expect(session).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
  expect(session!.expires).toBeGreaterThanOrEqual(startedAt + 432_000 - 5);
  expect(session!.expires).toBeLessThan(Date.now() / 1000 + 432_000 + 5);
  await Promise.all([
    page.waitForURL("**/admin/business-hours"),
    page.getByRole("link", { name: "Expediente", exact: true }).click(),
  ]);
  await expect(page).toHaveURL(/\/admin\/business-hours$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Expediente", exact: true })).toBeVisible();
  await Promise.all([
    page.waitForURL("**/admin/services"),
    page.getByRole("link", { name: "Serviços", exact: true }).click(),
  ]);
  await expect(page.getByRole("heading", { name: "Serviços", exact: true })).toBeVisible();
  const persisted = (await context.cookies()).find((cookie) => cookie.name === "admin_session");
  expect(persisted?.value).toBe(session!.value);
  expect(persisted?.expires).toBe(session!.expires);
  expect((await page.request.get("/api/admin/services")).status()).toBe(200);
});

for (const [name, email, loginPassword, message] of [
  ["wrong password", accounts.admin, "senha-incorreta", "E-mail ou senha inválidos."],
  ["nonexistent account", "absent@example.test", password, "E-mail ou senha inválidos."],
  ["non-admin", accounts.nonAdmin, password, "Sua conta não possui autorização administrativa."],
  [
    "admin without salonId",
    accounts.missingSalon,
    password,
    "Sua conta não possui autorização administrativa.",
  ],
] as const) {
  test(`denies ${name} without creating an administrative session`, async ({ page, context }) => {
    await page.goto("/login");
    await submitLogin(page, email, loginPassword);
    await expect(
      page.getByRole("region", { name: "Administração", exact: true }).getByRole("alert"),
    ).toHaveText(message);
    await expect(page).toHaveURL(/\/login$/);
    expect(
      (await context.cookies()).find((cookie) => cookie.name === "admin_session"),
    ).toBeUndefined();
    expect((await page.request.get("/api/admin/services")).status()).toBe(401);
  });
}

for (const path of ["/admin", "/admin/services", "/admin/business-hours"]) {
  test(`redirects unauthenticated direct access to ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(
      (url) => url.pathname === "/login" && url.searchParams.get("next") === path,
    );
    await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sair", exact: true })).toHaveCount(0);
  });

  test(`allows authenticated direct access to ${path}`, async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(path);
    const destination = path === "/admin" ? "/admin/services" : path;
    await expect(page).toHaveURL((url) => url.pathname === destination);
    await expect(page.getByRole("button", { name: "Sair", exact: true })).toBeVisible();
  });
}

test("returns to the internal administrative destination requested before login", async ({
  page,
}) => {
  await page.goto("/admin/business-hours");
  await expect(page).toHaveURL(/\/login\?next=/);
  await submitLogin(page);
  await expect(page).toHaveURL(/\/admin\/business-hours$/);
  await expect(page.getByRole("heading", { name: "Expediente", exact: true })).toBeVisible();
});

for (const next of ["https://example.test/steal", "//example.test/steal"]) {
  test(`rejects the external return destination ${next}`, async ({ page }) => {
    await page.goto(`/login?next=${encodeURIComponent(next)}`);
    await submitLogin(page);
    await expect(page).toHaveURL("http://127.0.0.1:3101/admin/services");
  });
}

test("redirects an already authorized visitor from login to services", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/admin\/services$/);
  await expect(page.getByRole("button", { name: "Sair", exact: true })).toBeVisible();
});

test("clears a stale cookie and renders a usable login without a redirect loop", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: "admin_session",
      value: "invalid-stale-session",
      url: "http://127.0.0.1:3101",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto("/admin/services");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeEnabled();
  await expect
    .poll(async () => (await context.cookies()).some((cookie) => cookie.name === "admin_session"))
    .toBe(false);
  await page.reload();
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeEnabled();
  await submitLogin(page);
  await expect(page).toHaveURL(/\/admin\/services$/);
});

test("logs out and protects every administrative route and API afterward", async ({
  page,
  context,
}) => {
  await loginAsAdmin(page);
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(
    (await context.cookies()).find((cookie) => cookie.name === "admin_session"),
  ).toBeUndefined();
  for (const path of ["/admin", "/admin/services", "/admin/business-hours"]) {
    await page.goto(path);
    await expect(page).toHaveURL(
      (url) => url.pathname === "/login" && url.searchParams.get("next") === path,
    );
  }
  expect((await page.request.get("/api/admin/services")).status()).toBe(401);
  expect((await page.request.get("/api/admin/business-hours")).status()).toBe(401);
});

for (const failure of ["HTTP 500", "network rejection"] as const) {
  test(`blocks replacing existing business hours after ${failure} and recovers through retry`, async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const existing = {
      appointmentIntervalMinutes: 25,
      weeklyHours: {
        monday: { isOpen: true, startLocalTime: "08:30", endLocalTime: "16:30" },
        tuesday: { isOpen: false, startLocalTime: "10:00", endLocalTime: "18:00" },
        wednesday: { isOpen: true, startLocalTime: "11:00", endLocalTime: "19:00" },
        thursday: { isOpen: true, startLocalTime: "08:00", endLocalTime: "15:00" },
        friday: { isOpen: true, startLocalTime: "10:30", endLocalTime: "17:30" },
        saturday: { isOpen: false, startLocalTime: "08:00", endLocalTime: "12:00" },
        sunday: { isOpen: true, startLocalTime: "12:00", endLocalTime: "16:00" },
      },
    };
    expect((await page.request.put("/api/admin/business-hours", { data: existing })).status()).toBe(
      200,
    );
    let failGet = true;
    const submitted: unknown[] = [];
    await page.route("**/api/admin/business-hours", async (route) => {
      if (route.request().method() === "PUT") submitted.push(route.request().postDataJSON());
      if (route.request().method() === "GET" && failGet) {
        if (failure === "network rejection") await route.abort("failed");
        else
          await route.fulfill({ status: 500, json: { error: "Falha temporária no expediente." } });
        return;
      }
      await route.continue();
    });

    await page.goto("/admin/business-hours");
    const error = page.getByRole("status").filter({
      hasText: failure === "HTTP 500" ? "Falha temporária no expediente." : /fetch|carregar/i,
    });
    await expect(error).toBeVisible();
    const form = page.locator("form");
    const controls = form.locator("input, button[type=submit]");
    for (const control of await controls.all()) await expect(control).toBeDisabled();
    // Exercise the submit handler as well as disabled browser controls.
    await form.evaluate((element) => (element as HTMLFormElement).requestSubmit());
    await expect(error).toBeVisible();

    failGet = false;
    const [retried] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/admin/business-hours") &&
          response.request().method() === "GET" &&
          response.status() === 200,
      ),
      page.getByRole("button", { name: "Tentar novamente", exact: true }).click(),
    ]);
    expect((await retried.json()).businessHours).toMatchObject(existing);
    expect(submitted).toEqual([]);
    const interval = page.getByLabel("Intervalo entre atendimentos (minutos)");
    await expect(interval).toBeEnabled();
    await expect(interval).toHaveValue("25");
    const monday = page.getByRole("group", { name: "Segunda-feira", exact: true });
    await expect(monday.getByLabel("Horário inicial", { exact: true })).toHaveValue("08:30");
    await interval.fill("30");
    const [saved] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/admin/business-hours") &&
          response.request().method() === "PUT",
      ),
      page.getByRole("button", { name: "Salvar expediente", exact: true }).click(),
    ]);
    expect(saved.status()).toBe(200);
    expect(submitted).toEqual([{ ...existing, appointmentIntervalMinutes: 30 }]);
    await expect(page.getByRole("status")).toHaveText("Expediente atualizado com sucesso.");
    const persisted = await page.request.get("/api/admin/business-hours");
    expect((await persisted.json()).businessHours).toMatchObject({
      ...existing,
      appointmentIntervalMinutes: 30,
    });
  });
}

test("the supported claim-change script invalidates an existing browser session", async ({
  page,
  context,
}) => {
  await loginAsAdmin(page);
  const session = (await context.cookies()).find((cookie) => cookie.name === "admin_session")!;
  const payload = JSON.parse(Buffer.from(session.value.split(".")[1], "base64url").toString()) as {
    auth_time: number;
  };
  // Firebase revocation timestamps use whole seconds; cross that boundary first.
  await expect.poll(() => Math.floor(Date.now() / 1000)).toBeGreaterThan(payload.auth_time);
  const execute = promisify(execFile);
  await execute(
    process.execPath,
    ["scripts/set-admin-claims.mjs", accounts.admin, `${salonId}-changed`],
    {
      env: {
        ...process.env,
        FIREBASE_PROJECT_ID: "demo-sistema-cabelo",
        GOOGLE_APPLICATION_CREDENTIALS: "",
        FIREBASE_SERVICE_ACCOUNT_JSON: "",
      },
      timeout: 15_000,
    },
  );
  expect((await page.request.get("/api/admin/services")).status()).toBe(401);
  await page.goto("/admin/business-hours");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeEnabled();
  expect(
    (await context.cookies()).find((cookie) => cookie.name === "admin_session"),
  ).toBeUndefined();
});
