import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        pitch: "#0f3d2e",
        lime: "#d7f56d",
        paper: "#f7f4ed",
        ink: "#18211e"
      }
    }
  },
  plugins: []
} satisfies Config;
