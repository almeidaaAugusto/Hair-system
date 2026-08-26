import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";

import type { CreateServiceInput, UpdateServiceInput } from "@/domain/services/service";

import * as serviceRepositoryModule from "./service-repository";
import { createFirestoreServicesRepository } from "./service-repository";

type StoredService = CreateServiceInput & {
  salonId: string;
  createdAt: Date;
  updatedAt: Date;
};

type ServicesRepositoryWithUpdate = ReturnType<typeof createFirestoreServicesRepository> & {
  update(salonId: string, serviceId: string, input: UpdateServiceInput): Promise<unknown>;
};

type ServiceRepositoryModuleWithNotFoundError = typeof serviceRepositoryModule & {
  ServiceNotFoundError: new (serviceId: string) => Error;
};

const serviceInput: CreateServiceInput = {
  name: "Corte",
  durationMinutes: 60,
  startingPriceCents: 8_000,
  hasVariablePrice: false,
  requiresEvaluation: false,
  isActive: true,
};

type FirestoreFakeOptions = {
  afterSet?: (
    documents: Map<string, StoredService>,
    documentId: string,
    data: Partial<StoredService>,
  ) => void;
};

type DocumentReferenceFake = {
  get(): Promise<{ exists: boolean; data(): StoredService | undefined }>;
  set(data: Partial<StoredService>, options?: { merge?: boolean }): Promise<void>;
};

function createFirestoreFake(options: FirestoreFakeOptions = {}) {
  const documents = new Map<string, StoredService>();
  let nextId = 1;
  const runTransaction = vi.fn(
    async (
      updateFunction: (transaction: {
        get(reference: DocumentReferenceFake): ReturnType<DocumentReferenceFake["get"]>;
        set(
          reference: DocumentReferenceFake,
          data: Partial<StoredService>,
          options?: { merge?: boolean },
        ): ReturnType<DocumentReferenceFake["set"]>;
      }) => Promise<unknown>,
    ) =>
      updateFunction({
        get: (reference) => reference.get(),
        set: (reference, data, options) => reference.set(data, options),
      }),
  );

  const firestore = {
    runTransaction,
    collection: vi.fn(() => ({
      doc(documentId = `service-${nextId++}`) {
        return {
          id: documentId,
          async get() {
            const data = documents.get(documentId);
            return { exists: data !== undefined, data: () => data };
          },
          async set(data: Partial<StoredService>, _options?: { merge?: boolean }) {
            void _options;
            documents.set(documentId, {
              ...documents.get(documentId),
              ...data,
            } as StoredService);
            options.afterSet?.(documents, documentId, data);
          },
        };
      },
      where(field: keyof StoredService, operator: "==", value: unknown) {
        return {
          orderBy(orderField: keyof StoredService, direction: "asc") {
            return {
              async get() {
                const docs = [...documents.entries()]
                  .filter(([, data]) => operator === "==" && data[field] === value)
                  .sort(([, left], [, right]) =>
                    direction === "asc" && left[orderField] > right[orderField] ? 1 : -1,
                  )
                  .map(([id, data]) => ({ id, data: () => data }));

                return { docs };
              },
            };
          },
        };
      },
    })),
  };

  return { documents, firestore: firestore as unknown as Firestore, runTransaction };
}

describe("FirestoreServicesRepository", () => {
  it("persists the exact salonId and audit timestamps when creating a service", async () => {
    const { documents, firestore } = createFirestoreFake();
    const repository = createFirestoreServicesRepository(firestore);

    const service = await repository.create("salon-1", serviceInput);
    const stored = documents.get(service.id);

    expect(stored).toMatchObject({ ...serviceInput, salonId: "salon-1" });
    expect(stored?.createdAt).toBeInstanceOf(Date);
    expect(stored?.updatedAt).toBeInstanceOf(Date);
  });

  it("lists only the requested salon's services ordered by name", async () => {
    const { firestore } = createFirestoreFake();
    const repository = createFirestoreServicesRepository(firestore);

    await repository.create("salon-1", { ...serviceInput, name: "Zigue-zague" });
    await repository.create("salon-2", { ...serviceInput, name: "Alheio" });
    await repository.create("salon-1", { ...serviceInput, name: "Barba", isActive: false });

    const services = await repository.list("salon-1");

    expect(services).toHaveLength(2);
    expect(services).toMatchObject([
      { salonId: "salon-1", name: "Barba", isActive: false },
      { salonId: "salon-1", name: "Zigue-zague", isActive: true },
    ]);
  });

  it("does not expose extra fields stored in a service document", async () => {
    const { documents, firestore } = createFirestoreFake();
    const repository = createFirestoreServicesRepository(firestore);
    const service = await repository.create("salon-1", serviceInput);

    documents.set(service.id, {
      ...documents.get(service.id),
      internalNote: "not for the admin client",
    } as StoredService);

    await expect(repository.list("salon-1")).resolves.toEqual([service]);
  });

  it("updates a service only within its salon, preserving createdAt and refreshing updatedAt", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      const { documents, firestore, runTransaction } = createFirestoreFake();
      const repository = createFirestoreServicesRepository(
        firestore,
      ) as ServicesRepositoryWithUpdate;
      const service = await repository.create("salon-1", serviceInput);
      const createdAt = documents.get(service.id)?.createdAt;

      vi.setSystemTime(new Date("2026-01-01T00:00:01.000Z"));
      await repository.update("salon-1", service.id, {
        ...serviceInput,
        name: "Corte infantil",
        isActive: false,
      });

      expect(runTransaction).toHaveBeenCalledTimes(1);

      expect(documents.get(service.id)).toMatchObject({
        ...serviceInput,
        name: "Corte infantil",
        isActive: false,
        salonId: "salon-1",
        createdAt,
      });
      expect(documents.get(service.id)?.updatedAt.getTime()).toBeGreaterThan(
        createdAt?.getTime() ?? 0,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws ServiceNotFoundError when the service is missing or belongs to another salon", async () => {
    const { firestore } = createFirestoreFake();
    const repository = createFirestoreServicesRepository(firestore) as ServicesRepositoryWithUpdate;
    const ServiceNotFoundError = (
      serviceRepositoryModule as ServiceRepositoryModuleWithNotFoundError
    ).ServiceNotFoundError;
    const otherSalonService = await repository.create("salon-2", serviceInput);

    await expect(
      repository.update("salon-1", "missing-service", serviceInput),
    ).rejects.toBeInstanceOf(ServiceNotFoundError);
    await expect(
      repository.update("salon-1", otherSalonService.id, serviceInput),
    ).rejects.toBeInstanceOf(ServiceNotFoundError);
  });

  it("keeps an inactive service document instead of removing it and supports reactivation", async () => {
    const { documents, firestore } = createFirestoreFake();
    const repository = createFirestoreServicesRepository(firestore) as ServicesRepositoryWithUpdate;
    const service = await repository.create("salon-1", serviceInput);

    const updatedService = await repository.update("salon-1", service.id, { isActive: false });

    expect(documents.get(service.id)).toMatchObject({
      ...serviceInput,
      isActive: false,
      salonId: "salon-1",
    });
    expect(updatedService).toMatchObject({ ...serviceInput, isActive: false });

    const reactivatedService = await repository.update("salon-1", service.id, { isActive: true });

    expect(documents.get(service.id)).toMatchObject({
      ...serviceInput,
      isActive: true,
      salonId: "salon-1",
    });
    expect(reactivatedService).toMatchObject({ ...serviceInput, isActive: true });
  });

  it("returns the latest editable fields after a status-only update", async () => {
    const { firestore } = createFirestoreFake({
      afterSet(documents, documentId, data) {
        if (data.isActive === false) {
          documents.set(documentId, {
            ...documents.get(documentId),
            name: "Nome alterado em outra sessao",
          } as StoredService);
        }
      },
    });
    const repository = createFirestoreServicesRepository(firestore) as ServicesRepositoryWithUpdate;
    const service = await repository.create("salon-1", serviceInput);

    const updatedService = await repository.update("salon-1", service.id, { isActive: false });

    expect(updatedService).toMatchObject({
      ...serviceInput,
      isActive: false,
      name: "Nome alterado em outra sessao",
    });
  });
});
