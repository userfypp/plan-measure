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
    },
  }),
);
