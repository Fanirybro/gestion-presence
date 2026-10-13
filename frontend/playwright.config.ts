import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:5175",
    headless: true,
    channel: "msedge",
    viewport: { width: 1440, height: 1000 },
  },
  reporter: "list",
  workers: 1,
  webServer: {
    command: "npm.cmd run dev -- --host 127.0.0.1 --port 5175 --strictPort",
    url: "http://127.0.0.1:5175",
    reuseExistingServer: true,
  },
});
