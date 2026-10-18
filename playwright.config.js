import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "*.spec.js",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:4377",
    channel: "chrome",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run build && node tests/e2e/server.mjs",
    url: "http://127.0.0.1:4377/functions/v1/mcp/config",
    timeout: 60000,
    reuseExistingServer: false,
  },
  reporter: "list",
});
