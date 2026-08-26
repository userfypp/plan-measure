import type { SessionV6 } from "../types/domain";

export interface AutosaveInputs {
  snapshot: SessionV6 | null;
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
  snapshot: SessionV6;
  pdfBlob: Blob;
} {
  return (
    inputs.snapshot !== null && inputs.pdfRuntimeReady && inputs.pdfBlob !== null && inputs.enabled
  );
}

export function enqueueAutosave(
  previous: Promise<void>,
  snapshot: SessionV6,
  generation: number,
  isCurrentGeneration: (generation: number) => boolean,
  save: (snapshot: SessionV6) => Promise<void>,
): Promise<void> {
  return previous
    .catch(() => undefined)
    .then(() => {
      if (!isCurrentGeneration(generation)) return;
      return save(snapshot);
    });
}
