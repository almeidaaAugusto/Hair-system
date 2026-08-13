import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import type { App } from "firebase-admin/app";

export function getAdminApp(): App {
  const existingApp = getApps()[0];
  if (existingApp) {
    return existingApp;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error("FIREBASE_PROJECT_ID não está configurado.");
  }

  return initializeApp({ credential: applicationDefault(), projectId });
}
