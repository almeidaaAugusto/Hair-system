import { getFirestore, type Firestore } from "firebase-admin/firestore";

import {
  BUSINESS_HOURS_TIME_ZONE,
  businessHoursSchema,
  type BusinessHours,
  type BusinessHoursInput,
} from "@/domain/business-hours/business-hours";
import { getAdminApp } from "@/server/firebase/admin";

export type BusinessHoursRepository = {
  get(salonId: string, professionalId: string): Promise<BusinessHours | null>;
  save(salonId: string, professionalId: string, input: BusinessHoursInput): Promise<BusinessHours>;
};

function documentId(salonId: string, professionalId: string): string {
  return Buffer.from(JSON.stringify([salonId, professionalId])).toString("base64url");
}

export function createFirestoreBusinessHoursRepository(
  firestore: Firestore = getFirestore(getAdminApp()),
): BusinessHoursRepository {
  function reference(salonId: string, professionalId: string) {
    return firestore.collection("businessHours").doc(documentId(salonId, professionalId));
  }

  return {
    async get(salonId, professionalId) {
      const snapshot = await reference(salonId, professionalId).get();
      if (!snapshot.exists) {
        return null;
      }

      return businessHoursSchema.parse(snapshot.data());
    },
    async save(salonId, professionalId, input) {
      const configuration: BusinessHours = {
        ...input,
        salonId,
        professionalId,
        timezone: BUSINESS_HOURS_TIME_ZONE,
      };
      const document = reference(salonId, professionalId);
      const existing = await document.get();
      const now = new Date();

      await document.set(
        {
          ...configuration,
          ...(existing.exists ? {} : { createdAt: now }),
          updatedAt: now,
        },
        { merge: true },
      );

      return configuration;
    },
  };
}
