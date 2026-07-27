import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

const workflowDataDir = join(tmpdir(), `browser-replay-playwright-${process.pid}`);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: process.env.BROWSERBASE_E2E
    ? undefined
    : {
        command: "npm run dev",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          ...process.env,
          WORKFLOW_DATA_DIR: workflowDataDir,
        },
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 960 } },
    },
  ],
});
