import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "/plan-measure/" : "/",
  plugins: [react()],
  worker: {
    format: "es",
  },
}));
