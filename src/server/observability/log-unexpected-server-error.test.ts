import { describe, expect, it, vi } from "vitest";

import { FirebaseAdminConfigError } from "@/server/firebase/admin-config-error";

import { logUnexpectedServerError } from "./log-unexpected-server-error";

describe("logUnexpectedServerError", () => {
  it("registra somente o nome do erro, sem detalhes potencialmente sensíveis", () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("Bearer token secreto não deve aparecer no log.");

    logUnexpectedServerError("/api/admin/services", error);

    expect(errorLog).toHaveBeenCalledWith("Falha inesperada em /api/admin/services", {
      errorName: "Error",
    });

    errorLog.mockRestore();
  });

  it("registra o codigo do erro (gRPC/Firebase) sem a mensagem", () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const grpc = Object.assign(new Error("9 FAILED_PRECONDITION: telefone +5511999999999"), {
      code: 9,
    });
    const named = Object.assign(new Error("segredo"), { code: "FAILED_PRECONDITION" });

    logUnexpectedServerError("/r", grpc);
    logUnexpectedServerError("/r", named);

    expect(errorLog).toHaveBeenNthCalledWith(1, "Falha inesperada em /r", {
      errorName: "Error",
      errorCode: 9,
    });
    expect(errorLog).toHaveBeenNthCalledWith(2, "Falha inesperada em /r", {
      errorName: "Error",
      errorCode: "FAILED_PRECONDITION",
    });
    errorLog.mockRestore();
  });

  it("ignora codigos que nao parecem identificadores seguros", () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logUnexpectedServerError(
      "/r",
      Object.assign(new Error("x"), { code: "Bearer abc def token com espacos" }),
    );

    expect(errorLog).toHaveBeenCalledWith("Falha inesperada em /r", { errorName: "Error" });
    errorLog.mockRestore();
  });

  it("registra a mensagem somente de erros de configuracao do Admin SDK", () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logUnexpectedServerError("/r", new FirebaseAdminConfigError("FIREBASE_PROJECT_ID ausente."));

    expect(errorLog).toHaveBeenCalledWith("Falha inesperada em /r", {
      errorName: "FirebaseAdminConfigError",
      configMessage: "FIREBASE_PROJECT_ID ausente.",
    });
    errorLog.mockRestore();
  });
});
