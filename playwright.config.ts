import { defineConfig } from "@playwright/test";

// The site must already run (it needs the Delivery login): see README "Test". The default is `npm run start`, not the
// dev server: `server.js` adds the redirects to one URL per page, which one test checks.
// The same suite checks any demo: BASE_URL=http://localhost:5000 npx playwright test
export default defineConfig({
  testDir: "tests",
  timeout: 30_000,
  use: { baseURL: process.env.BASE_URL ?? "http://127.0.0.1:3000" },
});
