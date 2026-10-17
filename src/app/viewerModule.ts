import { retryableImport } from "./retryableImport";

/** The viewer chunk: the canvas viewer and the dock it drives. */
export const loadViewerModule = retryableImport(() => import("../features/viewer/PdfViewer"));
