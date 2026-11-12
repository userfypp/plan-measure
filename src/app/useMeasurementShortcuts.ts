import type { MutableRefObject } from "react";
import type { LogicalPageBounds } from "../types/domain";
import type { ActionId } from "../utils/shortcuts/bindings";
import { useShortcutHandlers } from "../utils/shortcuts/dispatcher";
import {
  isMeasurementClipboardActionBlocked,
  measurementClipboardFitsPage,
  pasteMeasurementsClipboard,
} from "./measurementClipboard";
import type { MeasurementDeleteRequest } from "../features/measurements/MeasurementPanel";
import type { useSessionState } from "./sessionState";
import type { useWorkspaceState } from "./workspaceState";

type SessionState = ReturnType<typeof useSessionState>;
type WorkspaceState = ReturnType<typeof useWorkspaceState>;

const MEASUREMENT_ACTIONS: Partial<
  Record<ActionId, "copy-measurement" | "delete-measurement" | "paste-measurement">
> = {
  "edit.copy": "copy-measurement",
  "edit.paste": "paste-measurement",
  "edit.delete": "delete-measurement",
};

interface MeasurementShortcutsDeps {
  copyMeasurements: WorkspaceState["copyMeasurements"];
  calibrationCandidate: WorkspaceState["calibrationCandidate"];
  calibrationFlow: WorkspaceState["calibrationFlow"];
  calibrationReferenceEdit: WorkspaceState["calibrationReferenceEdit"];
  draft: WorkspaceState["draft"];
  measurementClipboard: WorkspaceState["measurementClipboard"];
  pasteMeasurements: SessionState["pasteMeasurements"];
  requestMeasurementDelete: (request: MeasurementDeleteRequest) => void;
  requestSelectedMeasurementsDelete: () => void;
  selectWorkspaceMeasurements: WorkspaceState["selectMeasurements"];
  selectedMeasurementId: WorkspaceState["selectedMeasurementId"];
  selectedMeasurementIds: WorkspaceState["selectedMeasurementIds"];
  session: SessionState["session"];
  setError: (message: string | null) => void;
  viewerPageBounds: { pageNumber: number; bounds: LogicalPageBounds } | null;
  activeMeasurementEditIdRef: MutableRefObject<string | null>;
  viewerPageZoomRef: MutableRefObject<{ pageNumber: number; zoom: number } | null>;
  applicationCopyRef: MutableRefObject<boolean>;
}

export function useMeasurementShortcuts({
  copyMeasurements,
  calibrationCandidate,
  calibrationFlow,
  calibrationReferenceEdit,
  draft,
  measurementClipboard,
  pasteMeasurements,
  requestMeasurementDelete,
  requestSelectedMeasurementsDelete,
  selectWorkspaceMeasurements,
  selectedMeasurementId,
  selectedMeasurementIds,
  session,
  setError,
  viewerPageBounds,
  activeMeasurementEditIdRef,
  viewerPageZoomRef,
  applicationCopyRef,
}: MeasurementShortcutsDeps) {
  /**
   * Application-level copy/paste stays available after non-editing application
   * controls receive focus; the dispatcher leaves editable controls and dialogs
   * their native clipboard behavior and gives Delete/Backspace the same
   * non-editing focus policy as the viewer shortcuts.
   */
  useShortcutHandlers((actionId, event) => {
    const action = MEASUREMENT_ACTIONS[actionId];
    if (!action || !session) return false;
    const page = session.pages[session.currentPage];
    if (!page) return false;
    if (
      action !== "delete-measurement" &&
      isMeasurementClipboardActionBlocked(action, {
        measurementEditActive: activeMeasurementEditIdRef.current !== null,
        draftActive: Boolean(draft),
        calibrationFlowActive: Boolean(calibrationFlow),
        calibrationCandidateActive: Boolean(calibrationCandidate),
        calibrationReferenceEditActive: Boolean(calibrationReferenceEdit),
      })
    ) {
      return false;
    }

    if (action === "paste-measurement") {
      if (!measurementClipboard) return false;
      event.preventDefault();
      const destinationBounds =
        viewerPageBounds?.pageNumber === page.pageNumber ? viewerPageBounds.bounds : null;
      const destinationZoom =
        viewerPageZoomRef.current?.pageNumber === page.pageNumber
          ? viewerPageZoomRef.current.zoom
          : null;
      if (!measurementClipboardFitsPage(measurementClipboard, page.pageNumber, destinationBounds)) {
        setError(
          destinationBounds
            ? "The copied measurements do not fit within this page without changing their geometry."
            : "Wait for this page to finish loading before pasting a measurement from another page.",
        );
        return true;
      }
      pasteMeasurementsClipboard({
        clipboard: measurementClipboard,
        pageNumber: page.pageNumber,
        destinationBounds,
        destinationZoom,
        pasteMeasurements,
        selectMeasurements: selectWorkspaceMeasurements,
      });
      return true;
    }

    if (
      action === "delete-measurement" &&
      (selectedMeasurementIds.length > 1 ||
        (selectedMeasurementIds.length === 1 &&
          !page.measurements.some((measurement) => measurement.id === selectedMeasurementId)))
    ) {
      event.preventDefault();
      requestSelectedMeasurementsDelete();
      return true;
    }
    if (action === "copy-measurement") {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return false;
      if (selectedMeasurementIds.length === 0) return false;
      const measurements = page.measurements.filter((measurement) =>
        selectedMeasurementIds.includes(measurement.id),
      );
      event.preventDefault();
      if (measurements.length !== selectedMeasurementIds.length) {
        setError("Select measurements from a single page to copy them together.");
        return true;
      }
      applicationCopyRef.current = true;
      copyMeasurements(page.pageNumber, measurements);
      queueMicrotask(() => {
        applicationCopyRef.current = false;
      });
      return true;
    }
    if (!selectedMeasurementId) return false;
    const measurement = page.measurements.find(
      (candidate) => candidate.id === selectedMeasurementId,
    );
    if (!measurement) return false;
    event.preventDefault();
    requestMeasurementDelete({
      pageNumber: page.pageNumber,
      measurementId: measurement.id,
      measurementName: measurement.name,
    });
    return true;
  });
}
