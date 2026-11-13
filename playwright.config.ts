import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: ["**/admin-auth.spec.ts", "**/admin-agenda.spec.ts", "**/admin-clients.spec.ts"],
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
