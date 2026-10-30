import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default defineConfig((env) =>
  mergeConfig(viteConfig(env), {
    test: {
      // Tests that need a DOM opt in with a `@vitest-environment jsdom` docblock: running every
      // file in jsdom adds about 18 s to the suite and breaks tests that expect Node globals.
      environment: "node",
      // Undo vi.spyOn, vi.stubGlobal and vi.stubEnv before each test, so no stub leaks into the
      // next test whether or not the file cleans up after itself.
      restoreMocks: true,
      unstubGlobals: true,
      unstubEnvs: true,
      // Coverage instrumentation slows the heaviest tests (5,000-row lists) from about 2 s to 4 s
      // or more on CI runners, past the 5 s default.
      testTimeout: 15_000,
      // `npm run test:coverage`. Reported only; no threshold fails the run.
      coverage: {
        provider: "v8",
        include: ["src/**/*.{ts,tsx}"],
        exclude: [
          "src/**/*.test.{ts,tsx}",
          "src/**/*TestUtils.{ts,tsx}",
          "src/performance/fixtures.ts",
          "src/vite-env.d.ts",
        ],
        reporter: ["text-summary", "json-summary", "html"],
      },
    },
  }),
);
