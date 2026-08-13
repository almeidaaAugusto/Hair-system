import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import type { App } from "firebase-admin/app";

function getAdminCredential() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) {
    return applicationDefault();
  }

  try {
    return cert(JSON.parse(serviceAccountJson));
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON deve conter um JSON válido.");
  }
}

export function getAdminApp(): App {
  const existingApp = getApps()[0];
  if (existingApp) {
    return existingApp;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error("FIREBASE_PROJECT_ID não está configurado.");
  }

  return initializeApp({ credential: getAdminCredential(), projectId });
}
