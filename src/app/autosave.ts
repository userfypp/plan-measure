import type { CurrentSession } from "../types/domain";
import { serializeSession } from "../services/persistenceCodec";

export interface AutosaveInputs {
  snapshot: CurrentSession | null;
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
  snapshot: CurrentSession;
  pdfBlob: Blob;
} {
  return (
    inputs.snapshot !== null && inputs.pdfRuntimeReady && inputs.pdfBlob !== null && inputs.enabled
  );
}

export function isSessionPersistable(session: CurrentSession): boolean {
  try {
    serializeSession(session);
    return true;
  } catch {
    return false;
  }
}

export function enqueueAutosave(
  previous: Promise<void>,
  snapshot: CurrentSession,
  generation: number,
  isCurrentGeneration: (generation: number) => boolean,
  save: (snapshot: CurrentSession) => Promise<void>,
): Promise<void> {
  return previous
    .catch(() => undefined)
    .then(() => {
      if (!isCurrentGeneration(generation)) return;
      return save(snapshot);
    });
}
