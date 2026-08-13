import { getFirestore, type Firestore } from "firebase-admin/firestore";

import type { CreateServiceInput, Service } from "@/domain/services/service";
import { getAdminApp } from "@/server/firebase/admin";

export type ServicesRepository = {
  create(salonId: string, input: CreateServiceInput): Promise<Service>;
  list(salonId: string): Promise<Service[]>;
};

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
        const data = document.data() as CreateServiceInput & { salonId: string };
        return { id: document.id, ...data };
      });
    },
  };
}
