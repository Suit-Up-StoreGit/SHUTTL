import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:4174",
    viewport: { width: 390, height: 844 },
    trace: "retain-on-failure",
    launchOptions: process.env.BROWSER_PATH
      ? { executablePath: process.env.BROWSER_PATH }
      : {},
  },
  webServer: {
    command: "node server/index.ts",
    url: "http://127.0.0.1:4174/api/health",
    reuseExistingServer: false,
    timeout: 30000,
    env: {
      PORT: "4174",
      HOST: "127.0.0.1",
      APP_ORIGIN: "http://127.0.0.1:4174",
      DATABASE_PATH: "./data/browser-tests.sqlite",
      NODE_ENV: "test",
      VALIDATED_EVIDENCE_POLICY: "false",
    },
  },
});
