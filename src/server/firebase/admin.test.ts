import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applicationDefault: vi.fn(),
  cert: vi.fn(),
  getApps: vi.fn(),
  initializeApp: vi.fn(),
}));

vi.mock("firebase-admin/app", () => mocks);

import { getAdminApp } from "./admin";

describe("getAdminApp", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("FIREBASE_PROJECT_ID", "hair-sys");
    mocks.getApps.mockReturnValue([]);
  });

  it("usa Application Default Credentials durante o desenvolvimento local", () => {
    const credential = { source: "application-default" };
    const app = { name: "[DEFAULT]" };
    mocks.applicationDefault.mockReturnValue(credential);
    mocks.initializeApp.mockReturnValue(app);

    expect(getAdminApp()).toBe(app);
    expect(mocks.initializeApp).toHaveBeenCalledWith({ credential, projectId: "hair-sys" });
  });

  it("usa a conta de serviço privada configurada na Vercel", () => {
    const serviceAccount = {
      client_email: "firebase-adminsdk@example.com",
      private_key: "private-key",
      project_id: "hair-sys",
    };
    const credential = { source: "service-account" };
    const app = { name: "[DEFAULT]" };
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_JSON", JSON.stringify(serviceAccount));
    mocks.cert.mockReturnValue(credential);
    mocks.initializeApp.mockReturnValue(app);

    expect(getAdminApp()).toBe(app);
    expect(mocks.cert).toHaveBeenCalledWith(serviceAccount);
    expect(mocks.initializeApp).toHaveBeenCalledWith({ credential, projectId: "hair-sys" });
  });

  it("remove espaços acidentais ao redor do JSON da conta de serviço", () => {
    const serviceAccount = { project_id: "hair-sys" };
    const credential = { source: "service-account" };
    const app = { name: "[DEFAULT]" };
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_JSON", `  ${JSON.stringify(serviceAccount)}  `);
    mocks.cert.mockReturnValue(credential);
    mocks.initializeApp.mockReturnValue(app);

    expect(getAdminApp()).toBe(app);
    expect(mocks.cert).toHaveBeenCalledWith(serviceAccount);
  });

  it("explica quando a credencial privada não chegou à Vercel", () => {
    vi.stubEnv("VERCEL", "1");

    expect(() => getAdminApp()).toThrow(
      "FIREBASE_SERVICE_ACCOUNT_JSON não está configurada para a Vercel.",
    );
  });

  it("explica quando a variável da conta de serviço não contém JSON", () => {
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_JSON", "não-é-json");

    expect(() => getAdminApp()).toThrow(
      "FIREBASE_SERVICE_ACCOUNT_JSON deve conter um JSON válido.",
    );
  });
});
