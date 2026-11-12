import { defineConfig, devices } from "@playwright/test";

function localEmulatorHost(name: string, port: number): string {
  const host = process.env[name] ?? `127.0.0.1:${port}`;
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
    throw new Error(`Auth E2E requires ${name} to use the local test port ${port}.`);
  }
  return host;
}

const authEmulatorHost = localEmulatorHost("FIREBASE_AUTH_EMULATOR_HOST", 9098);
const firestoreEmulatorHost = localEmulatorHost("FIRESTORE_EMULATOR_HOST", 8085);

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["admin-auth.spec.ts", "admin-agenda.spec.ts"],
  fullyParallel: false,
  maxFailures: 1,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3101",
    trace: "off", // Authentication traces can contain credentials and cookies.
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3101",
    stdout: "pipe",
    url: "http://127.0.0.1:3101",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      FIREBASE_AUTH_EMULATOR_HOST: authEmulatorHost,
      FIRESTORE_EMULATOR_HOST: firestoreEmulatorHost,
      FIREBASE_PROJECT_ID: "demo-sistema-cabelo",
      GCLOUD_PROJECT: "demo-sistema-cabelo",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-sistema-cabelo",
      NEXT_PUBLIC_FIREBASE_API_KEY: "demo-auth-e2e-key",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "demo-sistema-cabelo.firebaseapp.com",
      NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: authEmulatorHost,
      FIREBASE_SERVICE_ACCOUNT_JSON: "",
      GOOGLE_APPLICATION_CREDENTIALS: "",
      VERCEL: "",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
