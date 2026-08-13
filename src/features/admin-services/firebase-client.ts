"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

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
