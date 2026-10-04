import { defineConfig } from "@playwright/test";

// The real API (fresh SQLite file, demo PINs, deadlines lifted) and the Vite dev
// server, started for the run and stopped after it. Run `npm run build` first.
const API = "http://127.0.0.1:7111";
const WEB = "http://localhost:7112";

export default defineConfig({
  testDir: "e2e",
  workers: 1,
  use: { baseURL: WEB },
  webServer: [
    {
      command: `rm -f e2e/.data.sqlite && node server/dist/index.js`,
      url: `${API}/health`,
      env: {
        PORT: "7111",
        DATABASE_PATH: "e2e/.data.sqlite",
        ADMIN_PIN: "demo-admin",
        LEAGUE_PIN: "demo-league",
        CORS_ORIGIN: WEB,
        DEADLINES_DISABLED: "1"
      }
    },
    {
      command: "npm run dev -w web -- --port 7112 --strictPort",
      url: WEB,
      env: { VITE_API_BASE_URL: API }
    }
  ]
});
