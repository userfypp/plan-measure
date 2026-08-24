import type { SessionV5 } from "../types/domain";

export interface AutosaveInputs {
  snapshot: SessionV5 | null;
  pdfRuntimeReady: boolean;
  pdfBlob: Blob | null;
  enabled: boolean;
}

/**
 * Autosave is intentionally gated only by persistent data, a valid PDF
 * runtime, and persistence availability. Workspace and overlay state are not
 * inputs to this boundary.
 */
export function isAutosaveReady(inputs: AutosaveInputs): inputs is AutosaveInputs & {
  snapshot: SessionV5;
  pdfBlob: Blob;
} {
  return inputs.snapshot !== null && inputs.pdfRuntimeReady && inputs.pdfBlob !== null && inputs.enabled;
}

export function enqueueAutosave(
  previous: Promise<void>,
  snapshot: SessionV5,
  generation: number,
  isCurrentGeneration: (generation: number) => boolean,
  save: (snapshot: SessionV5) => Promise<void>,
): Promise<void> {
  return previous
    .catch(() => undefined)
    .then(() => {
      if (!isCurrentGeneration(generation)) return;
      return save(snapshot);
    });
}
