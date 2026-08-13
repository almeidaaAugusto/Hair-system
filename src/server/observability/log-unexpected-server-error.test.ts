import { describe, expect, it, vi } from "vitest";

import { logUnexpectedServerError } from "./log-unexpected-server-error";

describe("logUnexpectedServerError", () => {
  it("registra somente nome e mensagem do erro", () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("A conta de serviço não foi aceita.");

    logUnexpectedServerError("/api/admin/services", error);

    expect(errorLog).toHaveBeenCalledWith("Falha inesperada em /api/admin/services", {
      errorName: "Error",
      message: "A conta de serviço não foi aceita.",
    });

    errorLog.mockRestore();
  });
});
