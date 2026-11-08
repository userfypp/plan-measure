import { cpSync, existsSync, readFileSync, rmSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const pdfjsDirectory = `${import.meta.dirname}/node_modules/pdfjs-dist`;
const pdfjsVersion = (
  JSON.parse(readFileSync(`${pdfjsDirectory}/package.json`, "utf8")) as { version: string }
).version;

/**
 * pdf.js reads its decoders, CMaps, fonts and ICC data by fixed file names at run time. Copying
 * them next to the build keeps every request on the same origin; the version in the path stops a
 * cache from pairing the worker with the files of another release.
 */
function pdfjsResources(): Plugin {
  return {
    name: "plan-measure:pdfjs-resources",
    apply: "build",
    writeBundle({ dir }) {
      const target = `${dir}/pdfjs/${pdfjsVersion}`;
      for (const folder of ["cmaps", "standard_fonts", "iccs", "wasm"]) {
        if (!existsSync(`${pdfjsDirectory}/${folder}`)) {
          throw new Error(`pdfjs-dist ${pdfjsVersion} has no ${folder} folder to copy`);
        }
        cpSync(`${pdfjsDirectory}/${folder}`, `${target}/${folder}`, { recursive: true });
      }
      // Only the PDF scripting sandbox loads this interpreter, and the viewer never runs scripts.
      for (const file of ["quickjs-eval.js", "quickjs-eval.wasm"]) {
        rmSync(`${target}/wasm/${file}`, { force: true });
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "/plan-measure/" : "/",
  plugins: [react(), pdfjsResources()],
  define: {
    __PDFJS_ASSETS__: JSON.stringify(
      mode === "production" ? `/plan-measure/pdfjs/${pdfjsVersion}/` : "/node_modules/pdfjs-dist/",
    ),
  },
  css: {
    postcss: {
      plugins: [
        {
          // `composes: name from "./file.module.css"` makes postcss-modules prepend that file's CSS
          // as a string, so its declarations have no source file and Vite warned that a PostCSS
          // plugin did not pass `from`. They take the importing file as their source; one with a
          // url() keeps the warning, since its relative path would resolve from the wrong folder.
          postcssPlugin: "plan-measure:composed-css-source",
          OnceExit(root) {
            const input = root.source?.input;
            if (!input?.file) return;
            root.walkDecls((declaration) => {
              if (declaration.source?.input.file || declaration.value.includes("url(")) return;
              declaration.source = { input };
            });
          },
        },
      ],
    },
  },
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
