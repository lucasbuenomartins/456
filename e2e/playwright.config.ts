import { defineConfig, devices } from "@playwright/test";

const API_PORT = 3334;
const WEB_PORT = 5174;
export const WEB_URL = `http://localhost:${WEB_PORT}`;

const dbEnv = {
  DATABASE_URL: "postgres://clinica_app:clinica_app_dev@localhost:5432/clinica_e2e",
  DATABASE_ADMIN_URL: "postgres://clinica_owner:clinica_owner_dev@localhost:5432/clinica_e2e",
};

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [["list"]],
  globalSetup: "./global-setup.ts",
  use: {
    baseURL: WEB_URL,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 860 } } },
    { name: "tablet", use: { ...devices["Desktop Chrome"], viewport: { width: 820, height: 1180 }, hasTouch: true }, grep: /@responsivo/ },
    { name: "celular", use: { ...devices["Pixel 7"] }, grep: /@responsivo|@celular/ },
  ],
  webServer: [
    {
      command: "pnpm --filter @clinica/api exec tsx src/server.ts",
      cwd: "..",
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
      env: { ...dbEnv, PORT: String(API_PORT), APP_ORIGIN: WEB_URL, NODE_ENV: "development", AUTH_RATE_LIMIT: "1000" },
      timeout: 60_000,
    },
    {
      command: `pnpm --filter @clinica/web exec vite --port ${WEB_PORT} --strictPort`,
      cwd: "..",
      url: WEB_URL,
      reuseExistingServer: false,
      env: { API_URL: `http://localhost:${API_PORT}` },
      timeout: 60_000,
    },
  ],
});
