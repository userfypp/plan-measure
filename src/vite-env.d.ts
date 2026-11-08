/// <reference types="vite/client" />

declare module "pdfjs-dist/build/pdf.worker.min.mjs?url" {
  const workerUrl: string;
  export default workerUrl;
}

/** Folder with the pdf.js resources: copied into the build, or `node_modules` in development. */
declare const __PDFJS_ASSETS__: string;

/** The latest releases, read from `CHANGELOG.md` at build time (see `scripts/releaseNotes.ts`). */
declare module "virtual:release-notes" {
  const releases: import("./types/releaseNotes").ReleaseNote[];
  export default releases;
}
