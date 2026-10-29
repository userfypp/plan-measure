import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist", "coverage"]),
  {
    // Node scripts (CI and release automation, sample PDF and performance tooling) get the same
    // baseline checks as the app.
    files: [".github/scripts/**/*.mjs", "scripts/**/*.{js,mjs}", "perf/**/*.mjs"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        fetch: "readonly",
        Response: "readonly",
        AbortSignal: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        structuredClone: "readonly",
      },
    },
  },
  {
    // The benchmarks pass these functions to Playwright, which runs them in the page.
    files: ["perf/browser.mjs", "perf/page-browser.mjs", "perf/run.mjs"],
    languageOptions: {
      globals: {
        window: "readonly",
        document: "readonly",
        performance: "readonly",
        PerformanceObserver: "readonly",
        requestAnimationFrame: "readonly",
        getComputedStyle: "readonly",
        indexedDB: "readonly",
        CanvasRenderingContext2D: "readonly",
      },
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        document: "readonly",
        window: "readonly",
        console: "readonly",
        Blob: "readonly",
        URL: "readonly",
        HTMLAnchorElement: "readonly",
        FileReader: "readonly",
        indexedDB: "readonly",
        IDBKeyRange: "readonly",
        crypto: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        ResizeObserver: "readonly",
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      "react-refresh/only-export-components": "off",
    },
  },
]);
