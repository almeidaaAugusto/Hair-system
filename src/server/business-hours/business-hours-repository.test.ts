import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";

import { createDefaultBusinessHoursInput } from "@/domain/business-hours/business-hours";

import { createFirestoreBusinessHoursRepository } from "./business-hours-repository";

function createFirestoreFake() {
  const documents = new Map<string, Record<string, unknown>>();
  const firestore = {
    collection: vi.fn(() => ({
      doc(documentId: string) {
        return {
          async get() {
            const data = documents.get(documentId);
            return {
              exists: data !== undefined,
              data: () => data,
            };
          },
          async set(data: Record<string, unknown>) {
            documents.set(documentId, { ...documents.get(documentId), ...data });
          },
        };
      },
    })),
  };

  return { documents, firestore: firestore as unknown as Firestore };
}

describe("FirestoreBusinessHoursRepository", () => {
  it("persiste e isola o expediente pelo par salonId e professionalId", async () => {
    const { documents, firestore } = createFirestoreFake();
    const repository = createFirestoreBusinessHoursRepository(firestore);
    const firstSalon = createDefaultBusinessHoursInput();
    const secondSalon = createDefaultBusinessHoursInput();
    secondSalon.weeklyHours.friday.endLocalTime = "18:00";

    await repository.save("salon-1", "primary", firstSalon);
    await repository.save("salon-2", "primary", secondSalon);

    expect(documents.size).toBe(2);
    await expect(repository.get("salon-1", "primary")).resolves.toMatchObject({
      salonId: "salon-1",
      weeklyHours: { friday: { endLocalTime: "20:00" } },
    });
    await expect(repository.get("salon-2", "primary")).resolves.toMatchObject({
      salonId: "salon-2",
      weeklyHours: { friday: { endLocalTime: "18:00" } },
    });
  });

  it("substitui a configuração semanal do mesmo salão", async () => {
    const { documents, firestore } = createFirestoreFake();
    const repository = createFirestoreBusinessHoursRepository(firestore);
    const initial = createDefaultBusinessHoursInput();
    const updated = createDefaultBusinessHoursInput();
    updated.weeklyHours.sunday.isOpen = true;

    await repository.save("salon-1", "primary", initial);
    await repository.save("salon-1", "primary", updated);

    expect(documents.size).toBe(1);
    await expect(repository.get("salon-1", "primary")).resolves.toMatchObject({
      weeklyHours: { sunday: { isOpen: true } },
    });
  });
});
