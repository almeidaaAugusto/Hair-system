"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  inMemoryPersistence,
  setPersistence,
  type Auth,
} from "firebase/auth";

let sessionAuthPromise: Promise<Auth> | undefined;

function getFirebaseConfig() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (!apiKey || !authDomain || !projectId) {
    return null;
  }

  return { apiKey, authDomain, projectId };
}

export function getClientAuth() {
  const config = getFirebaseConfig();
  if (!config) {
    throw new Error("A configuração pública do Firebase não está disponível.");
  }

  const app = getApps().length ? getApp() : initializeApp(config);
  return getAuth(app);
}

async function configureSessionClientAuth(): Promise<Auth> {
  const auth = getClientAuth();
  const emulatorHost = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST;

  if (emulatorHost && auth.emulatorConfig === null) {
    const emulatorUrl =
      emulatorHost.startsWith("http://") || emulatorHost.startsWith("https://")
        ? emulatorHost
        : `http://${emulatorHost}`;
    connectAuthEmulator(auth, emulatorUrl, { disableWarnings: true });
  }

  await setPersistence(auth, inMemoryPersistence);
  return auth;
}

export function getSessionClientAuth(): Promise<Auth> {
  sessionAuthPromise ??= configureSessionClientAuth();
  return sessionAuthPromise;
}
