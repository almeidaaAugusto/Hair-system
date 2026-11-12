import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

const password = "senha-segura";
const runId = randomUUID();
const salonId = `agenda-e2e-salon-${runId}`;
const email = `agenda-admin-${runId}@example.test`;
const serviceId = `agenda-e2e-service-${runId}`;
const serviceName = "Corte E2E";
const clientName = `Cliente ${runId.slice(0, 8)}`;
let app: App | undefined;
let adminAuth: Auth;
let firestore: Firestore;
let userId: string | undefined;

/** A Monday at least a week ahead: inside the default Monday–Saturday hours. */
function upcomingMonday(): string {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + 7 + ((8 - date.getUTCDay()) % 7));
  return date.toISOString().slice(0, 10);
}
const date = upcomingMonday();

/** The Monday of the previous week: already past, so it can be concluded. */
function previousMonday(): string {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - 7 - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
const pastDate = previousMonday();

test.beforeAll(async () => {
  for (const [name, port] of [
    ["FIREBASE_AUTH_EMULATOR_HOST", "9098"],
    ["FIRESTORE_EMULATOR_HOST", "8085"],
  ]) {
    const host = process.env[name];
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
      throw new Error(`Agenda E2E requires the local ${name}; use npm run test:e2e:auth.`);
    }
  }
  app = initializeApp({ projectId: "demo-sistema-cabelo" }, `agenda-e2e-${runId}`);
  adminAuth = getAuth(app);
  firestore = getFirestore(app);
  const user = await adminAuth.createUser({ email, password });
  userId = user.uid;
  await adminAuth.setCustomUserClaims(user.uid, { admin: true, salonId });
  await firestore.collection("services").doc(serviceId).set({
    salonId,
    name: serviceName,
    durationMinutes: 60,
    startingPriceCents: 5000,
    hasVariablePrice: false,
    requiresEvaluation: false,
    isActive: true,
  });
});

test.afterAll(async () => {
  if (!app) return;
  try {
    for (const collection of ["services", "appointments", "timeBlocks", "appointmentDayLocks"]) {
      const documents = await firestore
        .collection(collection)
        .where("salonId", "==", salonId)
        .get();
      await Promise.all(documents.docs.map((document) => document.ref.delete()));
    }
    if (userId) await adminAuth.deleteUser(userId);
  } finally {
    await deleteApp(app);
  }
});

async function openAgenda(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await Promise.all([
    page.waitForURL("**/admin/agenda"),
    page.getByRole("button", { name: "Entrar", exact: true }).click(),
  ]);
  await expect(page.getByRole("heading", { name: "Agenda", exact: true })).toBeVisible();
}

test("books, views, cancels and blocks time from the administrative agenda", async ({ page }) => {
  page.on("dialog", (dialog) => void dialog.accept());
  await openAgenda(page);

  await page.getByRole("button", { name: "Novo agendamento" }).click();
  await page.getByLabel("Serviço").selectOption(serviceId);
  await page.getByLabel("Data", { exact: true }).fill(date);
  await page.getByLabel("Início").selectOption({ label: "09:00" });
  await page.getByLabel("Nome da cliente").fill(clientName);
  await page.getByLabel("Telefone (WhatsApp)").fill("(11) 98888-7777");
  await page.getByRole("button", { name: "Confirmar agendamento" }).click();

  await expect(
    page.getByRole("status").filter({ hasText: "Agendamento confirmado" }),
  ).toBeVisible();
  const item = page.getByRole("listitem").filter({ hasText: clientName });
  await expect(item).toContainText("09:00–10:00");
  await expect(item).toContainText(serviceName);
  await expect(item.getByRole("link", { name: "Abrir conversa" })).toHaveAttribute(
    "href",
    "https://wa.me/5511988887777",
  );

  // The same slot is no longer offered for a second booking.
  await page.getByRole("button", { name: "Novo agendamento" }).click();
  await page.getByLabel("Serviço").selectOption(serviceId);
  await page.getByLabel("Data", { exact: true }).fill(date);
  await expect(page.getByLabel("Início")).toBeVisible();
  await expect(page.getByLabel("Início").locator("option", { hasText: "09:00" })).toHaveCount(0);
  await expect(page.getByLabel("Início").locator("option", { hasText: "10:15" })).toHaveCount(1);
  await page.locator("form").getByRole("button", { name: "Cancelar", exact: true }).click();

  await page.getByRole("button", { name: "Semana", exact: true }).click();
  await expect(page.getByText(`${clientName} · ${serviceName}`)).toBeVisible();
  await page.getByRole("button", { name: "Mês", exact: true }).click();
  const day = page.getByRole("button", { name: /1 atendimento\(s\)/ });
  await expect(day).toBeVisible();
  await day.click();
  await expect(page.getByRole("button", { name: "Dia", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await item.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Atendimento cancelado" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(clientName)).toHaveCount(0);
  await page.getByLabel("Mostrar cancelados").check();
  await expect(page.getByRole("listitem").filter({ hasText: clientName })).toContainText(
    "Cancelado",
  );

  await page.getByRole("button", { name: "Bloquear horário" }).click();
  await page.getByLabel("Data", { exact: true }).fill(date);
  await page.getByLabel("Início").fill("12:00");
  await page.getByLabel("Fim").fill("13:00");
  await page.getByLabel("Motivo (opcional)").fill("Almoço");
  await page.getByRole("button", { name: "Bloquear", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Horário bloqueado" })).toBeVisible({
    timeout: 30_000,
  });
  const block = page.getByRole("listitem").filter({ hasText: "Almoço" });
  await expect(block).toContainText("12:00–13:00");
  await block.getByRole("button", { name: "Liberar horário" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Bloqueio removido" })).toBeVisible({
    timeout: 30_000,
  });
});

async function book(page: Page, day: string, time: string, name: string) {
  await page.getByRole("button", { name: "Novo agendamento" }).click();
  await page.getByLabel("Serviço").selectOption(serviceId);
  await page.getByLabel("Data", { exact: true }).fill(day);
  await page.getByLabel("Início").selectOption({ label: time });
  await page.getByLabel("Nome da cliente").fill(name);
  await page.getByLabel("Telefone (WhatsApp)").fill("(11) 98888-7777");
  await page.getByRole("button", { name: "Confirmar agendamento" }).click();
  // Wait for this booking's own confirmation, not a message left by a previous one.
  await expect(
    page.getByRole("status").filter({ hasText: `Agendamento confirmado: ${name}` }),
  ).toBeVisible();
}

test("concludes with partial then full payment, records a no-show and totals the day", async ({
  page,
}) => {
  // Two bookings plus four attendance actions; the dev server compiles routes on demand.
  test.setTimeout(240_000);
  // The first call to each new route compiles it in the dev server.
  const firstCompile = 30_000;
  page.on("dialog", (dialog) => void dialog.accept());
  const paying = `Pagante ${runId.slice(0, 6)}`;
  const absent = `Ausente ${runId.slice(0, 6)}`;
  await openAgenda(page);
  await book(page, pastDate, "09:00", paying);
  await book(page, pastDate, "10:15", absent);

  const payingItem = page.getByRole("listitem").filter({ hasText: paying });
  await payingItem.getByRole("button", { name: "Concluir", exact: true }).click();
  await payingItem.getByLabel("Valor pago (R$)").fill("30,00");
  await payingItem.getByLabel("Forma de pagamento").selectOption({ label: "Dinheiro" });
  await payingItem.getByRole("button", { name: "Concluir", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "concluído" })).toBeVisible({
    timeout: firstCompile,
  });
  await expect(payingItem).toContainText("Concluído");
  await expect(payingItem).toContainText(/Parcial: em aberto R\$\s20,00/);
  await expect(payingItem.getByRole("button", { name: "Cancelar" })).toHaveCount(0);
  const summary = page.getByRole("region", { name: "Financeiro no dia" });
  await expect(summary).toContainText(/Em aberto\s*R\$\s20,00/);
  await expect(summary).toContainText(/Recebido\s*R\$\s0,00/);

  await payingItem.getByRole("button", { name: "Editar pagamento" }).click();
  await payingItem.getByLabel("Valor pago (R$)").fill("50,00");
  await payingItem.getByLabel("Forma de pagamento").selectOption({ label: "Pix" });
  await payingItem.getByRole("button", { name: "Salvar pagamento" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Pagamento de" })).toBeVisible({
    timeout: firstCompile,
  });
  await expect(payingItem).toContainText(/Pago R\$\s50,00 · Pix/);
  await expect(summary).toContainText(/Recebido\s*R\$\s50,00/);
  await expect(summary).toContainText(/Em aberto\s*R\$\s0,00/);
  await expect(summary).toContainText("Pix");

  const absentItem = page.getByRole("listitem").filter({ hasText: absent });
  await absentItem.getByRole("button", { name: "Faltou" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Falta registrada" })).toBeVisible({
    timeout: firstCompile,
  });
  await expect(absentItem).toContainText("Faltou");
  await expect(absentItem.getByRole("button")).toHaveCount(0);
  await expect(summary).toContainText(/Faltas\s*1/);

  // The week view keeps the finished appointments visible with their outcome.
  await page.getByRole("button", { name: "Semana", exact: true }).click();
  await expect(page.getByText(`${paying} · ${serviceName} · concluído`)).toBeVisible();
  await expect(page.getByText(`${absent} · ${serviceName} · faltou`)).toBeVisible();
  await expect(page.getByRole("region", { name: "Financeiro na semana" })).toContainText(
    /Recebido\s*R\$\s50,00/,
  );
});

test("sends messages, records reminder and confirmation, then reschedules", async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  const firstCompile = 30_000;
  // Never reach the real WhatsApp site from tests.
  await context.route("https://wa.me/**", (route) => route.abort());
  const client = `Remarcar ${runId.slice(0, 6)}`;
  await openAgenda(page);
  await book(page, date, "14:00", client);
  const item = page.getByRole("listitem").filter({ hasText: client });

  const confirmation = item.getByRole("link", { name: "Confirmação" });
  const text = new URL((await confirmation.getAttribute("href"))!).searchParams.get("text");
  expect(text).toContain("Seu horário está confirmado");
  expect(text).toContain("às 14:00");

  const popup = context.waitForEvent("page");
  await item.getByRole("link", { name: "Enviar lembrete" }).click();
  await (await popup).close();
  await expect(item).toContainText("Lembrete enviado", { timeout: firstCompile });
  await expect(item.getByRole("link", { name: "Lembrete (de novo)" })).toBeVisible();

  await item.getByRole("button", { name: "Cliente confirmou" }).click();
  await expect(item).toContainText("Presença confirmada", { timeout: firstCompile });
  await expect(item.getByRole("button", { name: "Cliente confirmou" })).toHaveCount(0);

  const tuesday = new Date(`${date}T12:00:00Z`);
  tuesday.setUTCDate(tuesday.getUTCDate() + 1);
  const newDate = tuesday.toISOString().slice(0, 10);
  await item.getByRole("button", { name: "Reagendar" }).click();
  await item.getByLabel("Nova data").fill(newDate);
  await item.getByLabel("Início").selectOption({ label: "10:00" });
  await item.getByRole("button", { name: "Salvar novo horário" }).click();
  await expect(page.getByRole("status").filter({ hasText: "reagendada" })).toBeVisible({
    timeout: firstCompile,
  });
  await expect(page.getByLabel("Ir para a data")).toHaveValue(newDate);
  const moved = page.getByRole("listitem").filter({ hasText: client });
  await expect(moved).toContainText("10:00–11:00");
  // A new time requires a new reminder and a new confirmation.
  await expect(moved).not.toContainText("Lembrete enviado");
  await expect(moved).not.toContainText("Presença confirmada");
  await expect(moved.getByRole("link", { name: "Enviar lembrete" })).toBeVisible();
});
