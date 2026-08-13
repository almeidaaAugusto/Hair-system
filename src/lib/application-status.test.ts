import { describe, expect, it } from "vitest";

import { applicationStatus } from "./application-status";

describe("applicationStatus", () => {
  it("expõe a mensagem da página de verificação", () => {
    expect(applicationStatus.title).toBe("Fundação pronta");
  });
});
