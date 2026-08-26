import { getFirestore, type Firestore } from "firebase-admin/firestore";

import {
  createServiceSchema,
  type CreateServiceInput,
  type Service,
  type UpdateServiceInput,
} from "@/domain/services/service";
import { getAdminApp } from "@/server/firebase/admin";

export type ServicesRepository = {
  create(salonId: string, input: CreateServiceInput): Promise<Service>;
  list(salonId: string): Promise<Service[]>;
  update(salonId: string, serviceId: string, input: UpdateServiceInput): Promise<Service>;
};

export class ServiceNotFoundError extends Error {
  constructor() {
    super("Servi\u00e7o n\u00e3o encontrado.");
  }
}

export function createFirestoreServicesRepository(
  firestore: Firestore = getFirestore(getAdminApp()),
): ServicesRepository {
  return {
    async create(salonId, input) {
      const reference = firestore.collection("services").doc();
      await reference.set({
        ...input,
        salonId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return { id: reference.id, salonId, ...input };
    },
    async list(salonId) {
      const snapshot = await firestore
        .collection("services")
        .where("salonId", "==", salonId)
        .orderBy("name", "asc")
        .get();

      return snapshot.docs.map((document) => {
        const service = createServiceSchema.strip().parse(document.data());
        return { id: document.id, salonId, ...service };
      });
    },
    async update(salonId, serviceId, input) {
      const reference = firestore.collection("services").doc(serviceId);
      await firestore.runTransaction(async (transaction) => {
        const existing = await transaction.get(reference);
        const existingData = existing.data() as { salonId?: unknown } | undefined;

        if (!existing.exists || existingData?.salonId !== salonId) {
          throw new ServiceNotFoundError();
        }

        transaction.set(
          reference,
          {
            ...input,
            updatedAt: new Date(),
          },
          { merge: true },
        );
      });
      const updated = await reference.get();
      const updatedData = updated.data() as { salonId?: unknown } | undefined;

      if (!updated.exists || updatedData?.salonId !== salonId) {
        throw new ServiceNotFoundError();
      }
      const updatedService = createServiceSchema.strip().parse(updatedData);

      return { id: serviceId, salonId, ...updatedService };
    },
  };
}
