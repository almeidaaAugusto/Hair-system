import { describe, expect, it, vi } from "vitest";

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
});
