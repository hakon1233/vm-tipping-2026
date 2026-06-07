import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["web/src/**/*.test.{ts,tsx}"],
    setupFiles: ["web/src/test/setup.ts"]
  }
});
