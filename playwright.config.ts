import { defineConfig, devices } from "@playwright/test";

// The site must already run (it needs the Delivery login): see README "Test".
// The same suite checks any demo: BASE_URL=http://localhost:5000 npx playwright test
export default defineConfig({
  testDir: "tests",
  timeout: 30_000,
  use: { baseURL: process.env.BASE_URL ?? "http://127.0.0.1:5173" },
  projects: [{ name: "firefox", use: { ...devices["Desktop Firefox"] } }],
});
