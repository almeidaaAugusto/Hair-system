import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, describe, it } from "vitest";

let testEnvironment: RulesTestEnvironment;

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId: "demo-sistema-cabelo",
    firestore: {
      rules: readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8"),
    },
  });
});

afterAll(async () => {
  await testEnvironment?.cleanup();
});

describe("firestore rules", () => {
  it("nega leituras públicas durante a fundação", async () => {
    await assertFails(
      testEnvironment.unauthenticatedContext().firestore().doc("appointments/test").get(),
    );
  });

  it("nega escritas públicas durante a fundação", async () => {
    await assertFails(
      testEnvironment.unauthenticatedContext().firestore().doc("appointments/test").set({}),
    );
  });

  it("nega leituras diretas da configuração de expediente", async () => {
    await assertFails(
      testEnvironment.unauthenticatedContext().firestore().doc("businessHours/test").get(),
    );
  });

  it("nega escritas diretas da configuração de expediente", async () => {
    await assertFails(
      testEnvironment.unauthenticatedContext().firestore().doc("businessHours/test").set({}),
    );
  });

  it("denies direct service reads even for an authenticated admin", async () => {
    await assertFails(
      testEnvironment
        .authenticatedContext("admin-1", { admin: true, salonId: "salon-1" })
        .firestore()
        .doc("services/service-1")
        .get(),
    );
  });

  it("denies direct service writes even for an authenticated admin", async () => {
    await assertFails(
      testEnvironment
        .authenticatedContext("admin-1", { admin: true, salonId: "salon-1" })
        .firestore()
        .doc("services/service-1")
        .set({ name: "Corte", salonId: "salon-1" }),
    );
  });
});
