import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "/plan-measure/" : "/",
  plugins: [react()],
  resolve: {
    alias: [
      {
        // react-konva imports the full Konva build; keep only the nodes the viewer uses.
        find: /^konva$/,
        replacement: "/src/features/viewer/konvaRuntime.ts",
      },
    ],
  },
  worker: {
    format: "es",
  },
}));
