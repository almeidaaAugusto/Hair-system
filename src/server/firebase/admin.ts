import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import type { App, ServiceAccount } from "firebase-admin/app";

import { FirebaseAdminConfigError } from "./admin-config-error";

export { FirebaseAdminConfigError };

function getAdminCredential() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();

  if (!serviceAccountJson) {
    if (process.env.VERCEL) {
      throw new FirebaseAdminConfigError(
        "FIREBASE_SERVICE_ACCOUNT_JSON não está configurada para a Vercel.",
      );
    }

    return applicationDefault();
  }

  let serviceAccount: ServiceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson) as ServiceAccount;
  } catch {
    throw new FirebaseAdminConfigError("FIREBASE_SERVICE_ACCOUNT_JSON deve conter um JSON válido.");
  }

  try {
    return cert(serviceAccount);
  } catch {
    // The SDK message can quote parts of the credential; replace it with a fixed one.
    throw new FirebaseAdminConfigError(
      "FIREBASE_SERVICE_ACCOUNT_JSON não contém uma conta de serviço válida.",
    );
  }
}

export function getAdminApp(): App {
  const existingApp = getApps()[0];
  if (existingApp) {
    return existingApp;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new FirebaseAdminConfigError("FIREBASE_PROJECT_ID não está configurado.");
  }

  return initializeApp({ credential: getAdminCredential(), projectId });
}
