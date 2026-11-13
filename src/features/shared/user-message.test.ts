import { describe, expect, it } from "vitest";

import { AdminSessionExpiredError } from "@/features/admin-auth/admin-api-client";

import {
  OFFLINE_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
  UserMessageError,
  toUserMessage,
} from "./user-message";

describe("toUserMessage", () => {
  it("maps fetch network failures to the offline message", () => {
    expect(toUserMessage(new TypeError("Failed to fetch"), "Falhou.")).toBe(OFFLINE_MESSAGE);
    expect(toUserMessage(new TypeError("Load failed"), "Falhou.")).toBe(OFFLINE_MESSAGE);
  });

  it("keeps messages written for the user", () => {
    expect(toUserMessage(new UserMessageError("Serviço inativo."), "Falhou.")).toBe(
      "Serviço inativo.",
    );
  });

  it("hides technical errors behind the fallback", () => {
    expect(toUserMessage(new Error("Unexpected token < in JSON"), "Falhou.")).toBe("Falhou.");
    expect(toUserMessage(new SyntaxError("Unexpected end of JSON input"), "Falhou.")).toBe(
      "Falhou.",
    );
    expect(toUserMessage("boom", "Falhou.")).toBe("Falhou.");
    expect(toUserMessage(undefined, "Falhou.")).toBe("Falhou.");
  });

  it("explains an expired session", () => {
    expect(toUserMessage(new AdminSessionExpiredError(), "Falhou.")).toBe(SESSION_EXPIRED_MESSAGE);
  });
});
