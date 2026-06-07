import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `base` lets the built SPA live under a GitHub Pages subpath
// (e.g. https://hakon1233.github.io/vm-tipping-2026-web/). Set VITE_BASE_PATH at
// build time to the repo path with leading+trailing slashes ("/vm-tipping-2026-web/"),
// or leave it unset / "/" for a custom-domain / root deploy.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [react()],
  server: {
    port: 5173
  }
});
