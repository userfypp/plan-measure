// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PdfAnnotationLayer } from "../features/viewer/PdfAnnotationLayer";
import { resolveCanvasVisualRoles } from "../features/viewer/canvasVisualRoles";
import { performanceSession } from "./fixtures";

vi.mock("react-konva", () => ({
  Group: ({ children }: { children?: React.ReactNode }) => children ?? null,
  Label: ({ children }: { children?: React.ReactNode }) => children ?? null,
  Line: () => <span data-konva-line="" />,
  Circle: () => null, Tag: () => null, Text: () => null,
}));
vi.mock("konva/lib/shapes/Text", () => ({ Text: class { width() { return 10; } height() { return 10; } } }));
vi.mock("../app/sessionState", async (importOriginal) => ({
  ...await importOriginal<typeof import("../app/sessionState")>(),
  useMeasurementCommands: () => ({ updateMeasurement: vi.fn(), updateMeasurements: vi.fn() }),
}));

describe("presupuesto de montaje Konva", () => {
  it("el viewport monta ≤50 de 5000 formas y conserva propietarios fuera de pantalla", () => {
    const page = performanceSession().pages[1]!;
    const far = page.measurements.find((item) => item.points[0]!.x > 5000)!.id;
    const noop = () => undefined;
    const props = {
      page, bounds: { width: 10000, height: 10000, rotation: 0 as const },
      transform: { zoom: 1, panX: 0, panY: 0 }, viewport: { width: 300, height: 300 },
      activeTool: "select" as const, spacePan: false, isPanning: false,
      selectedMeasurementId: far, activeMeasurementEditId: null, calibrationReferenceEdit: null,
      measurementEditingBlocked: false, precisionAuthoringAvailable: true,
      visualRoles: resolveCanvasVisualRoles("light"), interactionTargetScreenPx: 24,
      displayUnit: "m" as const, areaDisplay: "auto" as const, measurementDecimalPlaces: 2 as const,
      showCalibration: false, showMeasurements: true, showLabels: false,
      onSelectMeasurement: noop, onCalibrationReferencePointsChange: noop,
      onCalibrationReferenceDragCancellationChange: noop, onMeasurementEditActiveChange: noop,
      onWholeMeasurementDragCancellationChange: noop, onVertexDragCancellationChange: noop,
    };
    const rendered = (candidate: Omit<typeof props, "selectedMeasurementId"> & { selectedMeasurementId: string | null }) => {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = renderToStaticMarkup(<PdfAnnotationLayer {...candidate} />);
      return wrapper.querySelectorAll("[data-konva-line]").length;
    };
    const count = rendered(props);
    expect(count).toBeGreaterThan(1);
    expect(count).toBeLessThanOrEqual(50);
    expect(count).toBe(rendered({ ...props, selectedMeasurementId: null }) + 1);
  });
});
