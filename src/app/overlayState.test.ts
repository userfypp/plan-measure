import { describe, expect, it } from "vitest";
import { getActiveOverlay, initialOverlayState, overlayReducer } from "./overlayState";

describe("overlay state", () => {
  it("starts with exactly one empty overlay slot", () => {
    expect(initialOverlayState).toEqual({ active: null });
    expect(getActiveOverlay(initialOverlayState)).toBeNull();
  });

  it("stores only a replace-PDF descriptor and closes only the matching request", () => {
    const opened = overlayReducer(initialOverlayState, { type: "REQUEST_REPLACE_PDF", payload: { pdfId: "pdf-1", fileName: "replacement.pdf" } });
    expect(opened.active).toEqual({ kind: "dialog", descriptor: { type: "replacePdf", payload: { pdfId: "pdf-1", fileName: "replacement.pdf" } } });
    expect(opened).not.toHaveProperty("file");
    expect(opened).not.toHaveProperty("session");

    const stale = overlayReducer(opened, { type: "CLOSE_DIALOG", dialog: { type: "replacePdf", payload: { pdfId: "old" } } });
    expect(stale).toBe(opened);
    expect(overlayReducer(opened, { type: "CLOSE_DIALOG" })).toEqual(initialOverlayState);
  });

  it("keeps confirmation payloads to identifiers and presentation values", () => {
    const state = overlayReducer(initialOverlayState, { type: "REQUEST_SAVE_CALIBRATION_REFERENCE_EDIT", payload: { pageNumber: 4, calibrationId: "scale-4", reference: "x", calibrationName: "Detail", measurementCount: 2 } });
    expect(state.active).toEqual({ kind: "confirmation", descriptor: { type: "saveCalibrationReferenceEdit", payload: { pageNumber: 4, calibrationId: "scale-4", reference: "x", calibrationName: "Detail", measurementCount: 2 } } });
    expect(state.active).not.toHaveProperty("onConfirm");
  });

  it("cannot represent two blocking overlays at the same time", () => {
    const dialog = overlayReducer(initialOverlayState, { type: "REQUEST_REPLACE_PDF", payload: { pdfId: "pdf-1" } });
    const confirmation = overlayReducer(dialog, { type: "REQUEST_DELETE_MEASUREMENT", payload: { pageNumber: 1, measurementId: "line-1", measurementName: "Hallway" } });

    expect(Object.keys(confirmation)).toEqual(["active"]);
    expect(getActiveOverlay(confirmation)).toEqual({ kind: "dialog", descriptor: { type: "replacePdf", payload: { pdfId: "pdf-1" } } });
  });
});
