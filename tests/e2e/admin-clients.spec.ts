import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";

const password = "senha-segura";
const runId = randomUUID();
const salonId = `clients-e2e-salon-${runId}`;
const email = `clients-admin-${runId}@example.test`;
const serviceId = `clients-e2e-service-${runId}`;
const clientName = `Ficha ${runId.slice(0, 8)}`;
let app: App | undefined;
let adminAuth: Auth;
let firestore: Firestore;
let userId: string | undefined;

/** A Monday at least a week ahead: inside the default Monday-Saturday hours. */
function upcomingMonday(): string {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + 7 + ((8 - date.getUTCDay()) % 7));
  return date.toISOString().slice(0, 10);
}
const date = upcomingMonday();

/** The Monday of the previous week: already past. */
function previousMonday(): string {
  const day = new Date();
  day.setUTCHours(12, 0, 0, 0);
  day.setUTCDate(day.getUTCDate() - 7 - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}
const pastDate = previousMonday();

// Same number in two formats: the phone is the client's identity.
const digits = String(Math.floor(10_000_000 + Math.random() * 89_999_999));
const maskedPhone = `(11) 9${digits.slice(0, 4)}-${digits.slice(4)}`;
const internationalPhone = `+55 11 9${digits}`;

test.beforeAll(async () => {
  for (const [name, port] of [
    ["FIREBASE_AUTH_EMULATOR_HOST", "9098"],
    ["FIRESTORE_EMULATOR_HOST", "8085"],
  ]) {
    const host = process.env[name];
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
      throw new Error(`Clients E2E requires the local ${name}; use npm run test:e2e:auth.`);
    }
  }
  app = initializeApp({ projectId: "demo-sistema-cabelo" }, `clients-e2e-${runId}`);
  adminAuth = getAuth(app);
  firestore = getFirestore(app);
  const user = await adminAuth.createUser({ email, password });
  userId = user.uid;
  await adminAuth.setCustomUserClaims(user.uid, { admin: true, salonId });
  await firestore.collection("services").doc(serviceId).set({
    salonId,
    name: "Corte E2E",
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
    for (const collection of [
      "services",
      "appointments",
      "timeBlocks",
      "appointmentDayLocks",
      "clients",
      "clientPhones",
    ]) {
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

test("a booking creates the client record, which holds chemical history and is found by phone", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const firstCompile = 30_000;
  page.on("dialog", (dialog) => void dialog.accept());
  await openAgenda(page);

  // New phone: the form asks for the name and the server creates the record.
  await page.getByRole("button", { name: "Novo agendamento" }).click();
  await page.getByLabel("Serviço").selectOption(serviceId);
  await page.getByLabel("Data", { exact: true }).fill(date);
  await page.getByLabel("Início").selectOption({ label: "09:00" });
  await page.getByLabel("Telefone (WhatsApp)").fill(maskedPhone);
  await page.getByLabel("Nome da cliente").fill(clientName);
  await page.getByRole("button", { name: "Confirmar agendamento" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: `Agendamento confirmado: ${clientName}` }),
  ).toBeVisible({ timeout: firstCompile });
  await expect(
    page.getByRole("listitem").filter({ hasText: clientName }).getByRole("link", {
      name: "Ver ficha",
    }),
  ).toBeVisible();

  // The record is listed under Clientes and searchable by name without accents/case.
  await page.getByRole("link", { name: "Clientes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Clientes", exact: true })).toBeVisible({
    timeout: firstCompile,
  });
  const row = page.getByRole("listitem").filter({ hasText: clientName });
  await expect(row).toBeVisible({ timeout: firstCompile });
  await page.getByLabel("Buscar cliente").fill(clientName.toUpperCase());
  await expect(row).toBeVisible();
  await page.getByLabel("Buscar cliente").fill("nenhuma-cliente-assim");
  await expect(page.getByText("Nenhuma cliente encontrada")).toBeVisible();
  await page.getByLabel("Buscar cliente").fill(digits.slice(0, 6));
  await expect(row).toBeVisible();

  // Open the record and add a chemical-history entry.
  await row.getByRole("link", { name: clientName }).click();
  await expect(page.getByRole("heading", { name: clientName, exact: true })).toBeVisible({
    timeout: firstCompile,
  });
  await expect(page.getByRole("region", { name: "Histórico de atendimentos" })).toContainText(
    "Corte E2E",
    { timeout: firstCompile },
  );
  await page.getByRole("button", { name: "Adicionar registro" }).click();
  await page.getByLabel("Procedimento").fill("Progressiva");
  await page.getByLabel("Produto (opcional)").fill("Marca X");
  await page.getByRole("button", { name: "Salvar registro" }).click();
  const chemical = page.getByRole("region", { name: "Histórico químico" });
  await expect(chemical).toContainText("Progressiva", { timeout: firstCompile });
  await expect(chemical).toContainText("Marca X");

  // Same phone in another format is the same client.
  await page.getByRole("link", { name: "Agenda", exact: true }).click();
  await page.getByRole("button", { name: "Novo agendamento" }).click();
  await page.getByLabel("Serviço").selectOption(serviceId);
  await page.getByLabel("Data", { exact: true }).fill(date);
  await page.getByLabel("Telefone (WhatsApp)").fill(internationalPhone);
  await expect(page.getByText(`Cliente: ${clientName}`)).toBeVisible({ timeout: firstCompile });
  await expect(page.getByLabel("Nome da cliente")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Ver ficha" })).toBeVisible();
});

/** Writes an appointment document the way the repository stores it (instants as Timestamps). */
async function seedAppointment(input: {
  id: string;
  localDate: string;
  startUtc: string;
  clientId?: string;
  client: { name: string; phone: string };
  status: "confirmed" | "completed" | "no_show";
  payment?: { finalPriceCents: number; paidCents: number; method?: "pix" };
}) {
  const start = new Date(`${input.localDate}T${input.startUtc}:00.000Z`);
  const end = new Date(start.getTime() + 60 * 60_000);
  const occupied = new Date(end.getTime() + 10 * 60_000);
  const now = Timestamp.fromDate(new Date());
  await firestore
    .collection("appointments")
    .doc(input.id)
    .set({
      id: input.id,
      salonId,
      professionalId: "primary",
      localDate: input.localDate,
      startAt: Timestamp.fromDate(start),
      endAt: Timestamp.fromDate(end),
      occupiedUntilAt: Timestamp.fromDate(occupied),
      status: input.status,
      ...(input.status === "completed" ? { completedAt: now } : {}),
      ...(input.status === "no_show" ? { noShowAt: now } : {}),
      ...(input.payment ? { payment: input.payment, paymentUpdatedAt: now } : {}),
      ...(input.clientId ? { clientId: input.clientId } : {}),
      client: input.client,
      serviceSnapshot: {
        serviceId,
        name: "Corte E2E",
        durationMinutes: 60,
        startingPriceCents: 5000,
        hasVariablePrice: false,
        requiresEvaluation: false,
      },
      appointmentIntervalMinutes: 10,
      source: "manual",
      exceptions: [],
      createdBy: "seed",
      updatedBy: "seed",
      createdAt: now,
      updatedAt: now,
    });
}

async function createClientThroughForm(page: Page, name: string, phone: string) {
  await page.getByRole("button", { name: "Nova cliente" }).click();
  const form = page.getByRole("form", { name: "Nova cliente" });
  await form.getByLabel("Nome", { exact: true }).fill(name);
  await form.getByLabel("Telefone (WhatsApp)").fill(phone);
  await form.getByRole("button", { name: "Cadastrar cliente" }).click();
}

test("the record summary counts paid and outstanding only for completed appointments, and a used phone is refused", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const firstCompile = 30_000;
  const nameA = `Resumo ${runId.slice(0, 8)}`;
  const nameB = `Outra ${runId.slice(0, 8)}`;
  // The first test's digits never start with 0, so these cannot collide with its phone.
  const phoneA = "(11) 90000-0001";
  const phoneB = "(11) 90000-0002";
  await openAgenda(page);
  await page.getByRole("link", { name: "Clientes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Clientes", exact: true })).toBeVisible({
    timeout: firstCompile,
  });
  // Creating a client lands on its record.
  await createClientThroughForm(page, nameA, phoneA);
  await expect(page.getByRole("heading", { name: nameA, exact: true })).toBeVisible({
    timeout: firstCompile,
  });
  const clientId = new URL(page.url()).pathname.split("/").pop() as string;
  await page.getByRole("link", { name: "Clientes", exact: true }).click();
  await createClientThroughForm(page, nameB, phoneB);
  await expect(page.getByRole("heading", { name: nameB, exact: true })).toBeVisible({
    timeout: firstCompile,
  });
  await page.goto(`/admin/clients/${clientId}`);
  await expect(page.getByRole("heading", { name: nameA, exact: true })).toBeVisible({
    timeout: firstCompile,
  });

  const snapshot = { name: nameA, phone: "55" + phoneA.replace(/\D/g, "") };
  await seedAppointment({
    id: `sum-1-${runId}`,
    localDate: pastDate,
    startUtc: "12:00",
    clientId,
    client: snapshot,
    status: "completed",
    payment: { finalPriceCents: 10_000, paidCents: 6_000, method: "pix" },
  });
  await seedAppointment({
    id: `sum-2-${runId}`,
    localDate: pastDate,
    startUtc: "15:00",
    clientId,
    client: snapshot,
    status: "completed",
    payment: { finalPriceCents: 5_000, paidCents: 5_000, method: "pix" },
  });
  await seedAppointment({
    id: `sum-3-${runId}`,
    localDate: pastDate,
    startUtc: "17:00",
    clientId,
    client: snapshot,
    status: "no_show",
  });
  await seedAppointment({
    id: `sum-4-${runId}`,
    localDate: date,
    startUtc: "18:00",
    clientId,
    client: snapshot,
    status: "confirmed",
  });
  await page.reload();

  const summary = page.getByRole("region", { name: "Resumo" });
  await expect(summary.locator("div", { hasText: "Atendimentos concluídos" }).last()).toContainText(
    "2",
    { timeout: firstCompile },
  );
  await expect(summary.locator("div", { hasText: "Faltas" }).last()).toContainText("1");
  await expect(summary.locator("div", { hasText: "Total pago" }).last()).toContainText("110,00");
  await expect(summary.locator("div", { hasText: "Em aberto" }).last()).toContainText("40,00");
  await expect(page.getByRole("list", { name: "Atendimentos" }).getByRole("listitem")).toHaveCount(
    4,
  );

  // Editing the phone to one that belongs to another client is refused with a clear message.
  await page.getByRole("button", { name: "Editar dados" }).click();
  await page.getByLabel("Telefone (WhatsApp)").fill(phoneB);
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Já existe outra cliente" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Abrir ficha existente" })).toBeVisible();
});

test("legacy appointments without clientId and a phone without 55 still show with a correct WhatsApp link", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const legacyName = `Legado ${runId.slice(0, 8)}`;
  await seedAppointment({
    id: `legacy-${runId}`,
    localDate: date,
    startUtc: "19:00",
    client: { name: legacyName, phone: "11977776666" },
    status: "confirmed",
  });
  await openAgenda(page);
  await page.getByLabel("Ir para a data").fill(date);
  const item = page.getByRole("listitem").filter({ hasText: legacyName });
  await expect(item).toBeVisible({ timeout: 30_000 });
  await expect(item).toContainText("(11) 97777-6666");
  await expect(item.getByRole("link", { name: "Abrir conversa" })).toHaveAttribute(
    "href",
    "https://wa.me/5511977776666",
  );
  await expect(item.getByRole("link", { name: "Ver ficha" })).toHaveCount(0);
});
