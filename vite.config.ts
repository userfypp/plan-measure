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
  optimizeDeps: {
    // Pre-bundling react-konva inlined its own copy of the aliased Konva runtime: that copy patched
    // the shared prototypes a second time and kept running stale code after the runtime changed.
    // react-konva is served as is so it imports the app's copy. Its Konva core imports are
    // pre-bundled with the app's, so both share one Konva, and so are its CommonJS dependencies.
    exclude: ["react-konva"],
    include: [
      "react-konva > konva/lib/Core.js",
      "react-konva > konva/lib/Global.js",
      "react-konva > react-reconciler",
      "react-konva > react-reconciler/constants.js",
      "react-konva > scheduler",
    ],
  },
  worker: {
    format: "es",
  },
}));
