import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite injects this config file's directory; typed here instead of pulling in @types/node.
declare global {
  interface ImportMeta {
    readonly dirname: string;
  }
}

export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "/plan-measure/" : "/",
  plugins: [react()],
  resolve: {
    alias: [
      {
        // react-konva imports the full Konva build; keep only the nodes the viewer uses.
        find: /^konva$/,
        // Absolute: dependency pre-bundling in dev cannot resolve root-relative paths.
        replacement: `${import.meta.dirname}/src/features/viewer/konvaRuntime.ts`,
      },
      {
        // Stops react-konva's context bridge from throwing on every Stage render.
        find: /^its-fine$/,
        replacement: `${import.meta.dirname}/src/features/viewer/itsFineRuntime.ts`,
      },
    ],
  },
  worker: {
    format: "es",
  },
}));
