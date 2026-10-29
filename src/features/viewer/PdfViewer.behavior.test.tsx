// @vitest-environment jsdom

import { act, useLayoutEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider, useSessionState } from "../../app/sessionState";
import { AppProvider } from "../../app/state";
import { ThemeProvider } from "../../app/themeState";
import { useWorkspaceState, WorkspaceProvider } from "../../app/workspaceState";
import type { CurrentSession, Point, ViewTransform } from "../../types/domain";
import { pageToScreen, screenToPage } from "../../utils/coordinates";
import { formatLinearValue } from "../../utils/format";
import { PdfViewer } from "./PdfViewer";
import { AuthoringCapabilityProvider, computeAuthoringCapability } from "./AuthoringCapability";
import { ViewerNavigationProvider, type ViewerNavigationModel } from "./ViewerNavigation";
import { ViewerInteractionCommandsProvider } from "./ViewerInteractionCommands";
import { ViewerBottomExclusionProvider } from "./viewerLayout";
import {
  createCalibratedSession,
  createPdfDocument,
  createPdfPage,
  installManualAnimationFrames,
  installViewerDomDoubles,
  konvaCapture,
  konvaPointerEvent,
  lastAnnotationLayer,
  resetKonvaCapture,
  stageHandler,
  VIEWER_HEIGHT,
  VIEWER_WIDTH,
} from "./viewerTestUtils";

vi.mock("pdfjs-dist", () => ({ getDocument: vi.fn(), GlobalWorkerOptions: {} }));
vi.mock("react-konva", async () => (await import("./viewerTestUtils")).createReactKonvaMock());
vi.mock("./PdfAnnotationLayer", async () =>
  (await import("./viewerTestUtils")).createAnnotationLayerMock(),
);

const noop = () => undefined;
let sessionProbe: ReturnType<typeof useSessionState> | null = null;
let workspaceProbe: ReturnType<typeof useWorkspaceState> | null = null;
let navigation: ViewerNavigationModel | null = null;
const viewZoomReports: Array<[number, number | null]> = [];

function Probes() {
  const session = useSessionState();
  const workspace = useWorkspaceState();
  useLayoutEffect(() => {
    sessionProbe = session;
    workspaceProbe = workspace;
  }, [session, workspace]);
  return null;
}

/** El visor real con la página tomada de la sesión y la navegación de página conectada. */
function Harness({ document }: { document: PDFDocumentProxy }) {
  const { session } = useSessionState();
  const [pageNumber, setPageNumber] = useState(1);
  const page = session?.pages[pageNumber];
  if (!page) return null;
  return (
    <PdfViewer
      document={document}
      keyboardAuthoringEnabled
      page={page}
      onPageChange={setPageNumber}
      onPageBoundsChange={noop}
      onViewZoomChange={(pageNo, zoom) => viewZoomReports.push([pageNo, zoom])}
      activeMeasurementEditId={null}
      onMeasurementEditActiveChange={noop}
      onChooseTool={(tool) => workspaceProbe!.chooseTool(tool)}
      onCalibrationCandidate={noop}
      onCalibrationCancel={noop}
      calibrationReferenceEdit={null}
      measurementEditingBlocked={false}
      onCalibrationReferencePointsChange={noop}
      onCalibrationReferenceEditCancel={noop}
    />
  );
}

describe("PdfViewer behavior", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    resetKonvaCapture();
    viewZoomReports.length = 0;
    sessionProbe = null;
    workspaceProbe = null;
    navigation = null;
    installViewerDomDoubles();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function mount(session: CurrentSession, pdf = createPdfDocument()) {
    await act(async () => {
      root.render(
        <ThemeProvider>
          <AppProvider>
            <SessionProvider>
              <WorkspaceProvider>
                <ViewerInteractionCommandsProvider>
                  <AuthoringCapabilityProvider
                    capability={computeAuthoringCapability({
                      viewerSize: { width: VIEWER_WIDTH, height: VIEWER_HEIGHT },
                      rightObstruction: 0,
                      bottomExclusion: 0,
                      finePointer: true,
                    })}
                  >
                    <ViewerBottomExclusionProvider bottomExclusion={0}>
                      <ViewerNavigationProvider
                        registerNavigation={(next) => {
                          navigation = next;
                        }}
                      >
                        <Probes />
                        <Harness document={pdf} />
                      </ViewerNavigationProvider>
                    </ViewerBottomExclusionProvider>
                  </AuthoringCapabilityProvider>
                </ViewerInteractionCommandsProvider>
              </WorkspaceProvider>
            </SessionProvider>
          </AppProvider>
        </ThemeProvider>,
      );
    });
    await act(async () => sessionProbe!.loadSession(session));
  }

  const transform = () => lastAnnotationLayer().transform as ViewTransform;
  const measurements = (pageNumber = 1) => sessionProbe!.session!.pages[pageNumber]!.measurements;

  async function click(point: Point) {
    await act(async () =>
      stageHandler("onClick")(konvaPointerEvent(pageToScreen(point, transform()))),
    );
  }

  async function clickWithShift(point: Point) {
    await act(async () =>
      stageHandler("onClick")(
        konvaPointerEvent(pageToScreen(point, transform()), { shiftKey: true }),
      ),
    );
  }

  async function key(name: string) {
    const viewer = container.querySelector<HTMLElement>('[role="region"][tabindex="0"]')!;
    await act(async () => {
      viewer.focus();
      viewer.dispatchEvent(
        new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }),
      );
    });
  }

  function expectPoints(actual: Point[], expected: Point[]) {
    expect(actual).toHaveLength(expected.length);
    expected.forEach((point, index) => {
      expect(actual[index]!.x).toBeCloseTo(point.x, 6);
      expect(actual[index]!.y).toBeCloseTo(point.y, 6);
    });
  }

  describe("drawing", () => {
    it("completes a Line on the second click with the clicked page points and the active scale", async () => {
      await mount(createCalibratedSession());
      await act(async () => workspaceProbe!.chooseTool("line"));
      await click({ x: 20, y: 30 });
      expect(measurements()).toHaveLength(0);
      expect(workspaceProbe!.draft).toMatchObject({ type: "path", measurementType: "line" });
      await click({ x: 120, y: 30 });
      expect(measurements()).toHaveLength(1);
      expect(measurements()[0]).toMatchObject({
        type: "line",
        calibrationId: "scale-1",
        name: "Line 1",
      });
      expectPoints(measurements()[0]!.points, [
        { x: 20, y: 30 },
        { x: 120, y: 30 },
      ]);
      expect(workspaceProbe!.draft).toBeNull();
      expect(workspaceProbe!.selectedMeasurementId).toBe(measurements()[0]!.id);
    });

    it("keeps a Polyline open across clicks and finishes it with Enter", async () => {
      await mount(createCalibratedSession());
      await act(async () => workspaceProbe!.chooseTool("polyline"));
      for (const point of [
        { x: 20, y: 20 },
        { x: 120, y: 20 },
        { x: 120, y: 120 },
      ])
        await click(point);
      expect(measurements()).toHaveLength(0);
      expect(workspaceProbe!.draft?.points).toHaveLength(3);
      await key("Enter");
      expect(measurements()).toHaveLength(1);
      expect(measurements()[0]).toMatchObject({
        type: "polyline",
        calibrationId: "scale-1",
        name: "Polyline 1",
      });
      expectPoints(measurements()[0]!.points, [
        { x: 20, y: 20 },
        { x: 120, y: 20 },
        { x: 120, y: 120 },
      ]);
      expect(workspaceProbe!.draft).toBeNull();
      expect(workspaceProbe!.activeTool).toBe("polyline");
    });

    it("closes a Polygon by clicking on its first vertex without duplicating it", async () => {
      await mount(createCalibratedSession());
      await act(async () => workspaceProbe!.chooseTool("polygon"));
      for (const point of [
        { x: 20, y: 20 },
        { x: 120, y: 20 },
        { x: 120, y: 120 },
      ])
        await click(point);
      expect(measurements()).toHaveLength(0);
      await click({ x: 20, y: 20 });
      expect(measurements()).toHaveLength(1);
      expect(measurements()[0]).toMatchObject({ type: "polygon", name: "Polygon 1" });
      expectPoints(measurements()[0]!.points, [
        { x: 20, y: 20 },
        { x: 120, y: 20 },
        { x: 120, y: 120 },
      ]);
      expect(workspaceProbe!.draft).toBeNull();
    });

    it("does not close a Polygon with fewer than three vertices", async () => {
      await mount(createCalibratedSession());
      await act(async () => workspaceProbe!.chooseTool("polygon"));
      await click({ x: 20, y: 20 });
      await click({ x: 120, y: 20 });
      await click({ x: 20, y: 20 });
      expect(measurements()).toHaveLength(0);
      expect(workspaceProbe!.draft?.points).toHaveLength(2);
    });

    it.each([
      ["rectangle", "Rectangle 1"],
      ["ellipse", "Ellipse 1"],
    ] as const)("completes a %s from two opposite corners", async (tool, name) => {
      await mount(createCalibratedSession());
      await act(async () => workspaceProbe!.chooseTool(tool));
      await click({ x: 20, y: 30 });
      expect(measurements()).toHaveLength(0);
      await click({ x: 120, y: 80 });
      expect(measurements()).toHaveLength(1);
      expect(measurements()[0]).toMatchObject({ type: tool, name, calibrationId: "scale-1" });
      expectPoints(measurements()[0]!.points, [
        { x: 20, y: 30 },
        { x: 120, y: 30 },
        { x: 120, y: 80 },
        { x: 20, y: 80 },
      ]);
      expect(workspaceProbe!.draft).toBeNull();
    });

    it("constrains a rectangle to a square while Shift is held", async () => {
      await mount(createCalibratedSession());
      await act(async () => workspaceProbe!.chooseTool("rectangle"));
      await click({ x: 20, y: 30 });
      await clickWithShift({ x: 120, y: 80 });
      expectPoints(measurements()[0]!.points, [
        { x: 20, y: 30 },
        { x: 120, y: 30 },
        { x: 120, y: 130 },
        { x: 20, y: 130 },
      ]);
    });

    describe("box drawing guides", () => {
      async function moveTo(point: Point, shiftKey = false) {
        await act(async () =>
          stageHandler("onMouseMove")(
            konvaPointerEvent(pageToScreen(point, transform()), { shiftKey }),
          ),
        );
      }
      const last = (list: Record<string, unknown>[], name: string, count = 1) =>
        list.filter((props) => props.name === name).slice(-count);
      const expectFlat = (actual: unknown, expected: number[]) => {
        expect(actual).toHaveLength(expected.length);
        expected.forEach((value, index) =>
          expect((actual as number[])[index]).toBeCloseTo(value, 6),
        );
      };
      const guideTexts = () => konvaCapture.texts.slice(-2).map((props) => props.text);

      it("shows the bounding box, eight square handles, center cross, axes and live dimensions for an ellipse", async () => {
        const session = createCalibratedSession();
        await mount(session);
        await act(async () => workspaceProbe!.chooseTool("ellipse"));
        await click({ x: 20, y: 30 });
        expect(last(konvaCapture.rects, "box-guide-handle", 8)).toHaveLength(0);
        await moveTo({ x: 120, y: 80 });
        const zoom = transform().zoom;

        const bounds = last(konvaCapture.lines, "box-guide-bounds")[0]!;
        expect(bounds).toMatchObject({ closed: true, listening: false });
        expectFlat(bounds.points, [20, 30, 120, 30, 120, 80, 20, 80]);
        expect(bounds.dash).toBeUndefined();
        expect(bounds.strokeWidth as number).toBeCloseTo(1 / zoom, 10);
        expect(bounds.opacity as number).toBeLessThan(1);
        const axes = [
          ...last(konvaCapture.lines, "box-guide-axis-horizontal"),
          ...last(konvaCapture.lines, "box-guide-axis-vertical"),
        ];
        expectFlat(axes[0]!.points, [20, 55, 120, 55]);
        expectFlat(axes[1]!.points, [70, 30, 70, 80]);
        expect(axes.every((axis) => (axis.opacity as number) < (bounds.opacity as number))).toBe(
          true,
        );
        const cross = last(konvaCapture.lines, "box-guide-center-cross", 2);
        expectFlat(cross[0]!.points, [70 - 4 / zoom, 55, 70 + 4 / zoom, 55]);
        expectFlat(cross[1]!.points, [70, 55 - 4 / zoom, 70, 55 + 4 / zoom]);
        const handles = last(konvaCapture.rects, "box-guide-handle", 8);
        expect(handles).toHaveLength(8);
        const centers = handles.map((handle) => [
          (handle.x as number) + (handle.width as number) / 2,
          (handle.y as number) + (handle.height as number) / 2,
        ]);
        for (const [x, y] of [
          [20, 30],
          [120, 30],
          [120, 80],
          [20, 80],
          [70, 30],
          [120, 55],
          [70, 80],
          [20, 55],
        ]) {
          expect(
            centers.some(([cx, cy]) => Math.abs(cx! - x!) < 1e-9 && Math.abs(cy! - y!) < 1e-9),
          ).toBe(true);
        }
        expect(
          handles.every((handle) => handle.width === handle.height && handle.listening === false),
        ).toBe(true);
        expect(handles[0]!.width as number).toBeCloseTo(7 / zoom, 10);

        const { displayUnit, measurementDecimalPlaces } = sessionProbe!.session!.settings;
        expect(guideTexts()).toEqual([
          formatLinearValue(10000, displayUnit, measurementDecimalPlaces),
          formatLinearValue(5000, displayUnit, measurementDecimalPlaces),
        ]);
      });

      it("keeps the guides with Shift (circle) and updates the dimensions", async () => {
        await mount(createCalibratedSession());
        await act(async () => workspaceProbe!.chooseTool("ellipse"));
        await click({ x: 20, y: 30 });
        await moveTo({ x: 120, y: 80 }, true);
        expectFlat(
          last(konvaCapture.lines, "box-guide-bounds")[0]!.points,
          [20, 30, 120, 30, 120, 130, 20, 130],
        );
        expect(last(konvaCapture.rects, "box-guide-handle", 8)).toHaveLength(8);
        const { displayUnit, measurementDecimalPlaces } = sessionProbe!.session!.settings;
        const side = formatLinearValue(10000, displayUnit, measurementDecimalPlaces);
        expect(guideTexts()).toEqual([side, side]);
      });

      it("shows page pixels without a scale and only handles and dimensions for a rectangle", async () => {
        await mount(createCalibratedSession(1, { calibrated: false }));
        await act(async () => workspaceProbe!.chooseTool("rectangle"));
        await click({ x: 20, y: 30 });
        const linesBefore = konvaCapture.lines.filter((line) =>
          String(line.name ?? "").startsWith("box-guide"),
        ).length;
        await moveTo({ x: 120, y: 80 });
        expect(
          konvaCapture.lines.filter((line) => String(line.name ?? "").startsWith("box-guide"))
            .length,
        ).toBe(linesBefore);
        expect(last(konvaCapture.rects, "box-guide-handle", 8)).toHaveLength(8);
        expect(guideTexts()).toEqual(["100 px", "50 px"]);
      });

      it("draws no guides for a degenerate box or other tools", async () => {
        await mount(createCalibratedSession());
        await act(async () => workspaceProbe!.chooseTool("ellipse"));
        await click({ x: 20, y: 30 });
        await moveTo({ x: 20, y: 80 });
        expect(
          konvaCapture.rects.filter((props) => props.name === "box-guide-handle"),
        ).toHaveLength(0);
        await act(async () => workspaceProbe!.chooseTool("polygon"));
        await click({ x: 20, y: 30 });
        await moveTo({ x: 120, y: 80 });
        expect(
          konvaCapture.rects.filter((props) => props.name === "box-guide-handle"),
        ).toHaveLength(0);
      });
    });

    it("does not complete a box with a degenerate second click", async () => {
      await mount(createCalibratedSession());
      await act(async () => workspaceProbe!.chooseTool("rectangle"));
      await click({ x: 20, y: 30 });
      await click({ x: 20, y: 90 });
      expect(measurements()).toHaveLength(0);
      expect(workspaceProbe!.draft?.points).toHaveLength(1);
    });

    it("builds a Cloud like a polygon and finishes it with Enter", async () => {
      await mount(createCalibratedSession());
      await act(async () => workspaceProbe!.chooseTool("cloud"));
      for (const point of [
        { x: 20, y: 20 },
        { x: 120, y: 20 },
        { x: 120, y: 120 },
      ])
        await click(point);
      expect(measurements()).toHaveLength(0);
      await key("Enter");
      expect(measurements()).toHaveLength(1);
      expect(measurements()[0]).toMatchObject({ type: "cloud", name: "Cloud 1" });
      expectPoints(measurements()[0]!.points, [
        { x: 20, y: 20 },
        { x: 120, y: 20 },
        { x: 120, y: 120 },
      ]);
    });

    it("creates separate Count measurements without a scale and keeps the tool armed", async () => {
      await mount(createCalibratedSession(1, { calibrated: false }));
      await act(async () => workspaceProbe!.chooseTool("count"));
      await click({ x: 50, y: 60 });
      await act(async () => workspaceProbe!.clearSelection());
      await click({ x: 150, y: 160 });
      expect(
        measurements().map(({ type, name, calibrationId }) => ({ type, name, calibrationId })),
      ).toEqual([
        { type: "count", name: "Count 1", calibrationId: null },
        { type: "count", name: "Count 2", calibrationId: null },
      ]);
      expectPoints(measurements()[1]!.points, [{ x: 150, y: 160 }]);
      expect(workspaceProbe!.activeTool).toBe("count");
    });

    it.each(["line", "polyline", "polygon", "rectangle", "ellipse", "cloud"] as const)(
      "cancels an in-progress %s with Escape and creates nothing",
      async (tool) => {
        await mount(createCalibratedSession());
        await act(async () => workspaceProbe!.chooseTool(tool));
        await click({ x: 20, y: 20 });
        if (tool === "polyline" || tool === "polygon" || tool === "cloud")
          await click({ x: 120, y: 20 });
        expect(workspaceProbe!.draft).not.toBeNull();
        await key("Escape");
        expect(workspaceProbe!.draft).toBeNull();
        expect(measurements()).toHaveLength(0);
        expect(workspaceProbe!.activeTool).toBe(tool);
        await key("Escape");
        expect(workspaceProbe!.activeTool).toBe("select");
      },
    );

    it("ignores clicks outside the page and with a non-primary button", async () => {
      await mount(createCalibratedSession());
      await act(async () => workspaceProbe!.chooseTool("polyline"));
      const outside = pageToScreen({ x: -50, y: -50 }, transform());
      await act(async () => stageHandler("onClick")(konvaPointerEvent(outside)));
      await act(async () =>
        stageHandler("onClick")(
          konvaPointerEvent(pageToScreen({ x: 40, y: 40 }, transform()), { button: 2 }),
        ),
      );
      expect(workspaceProbe!.draft).toBeNull();
    });

    it("uses the screen-to-page mapping of the current zoom for new points", async () => {
      await mount(createCalibratedSession());
      await act(async () => navigation!.onZoomIn());
      await act(async () => navigation!.onZoomIn());
      await act(async () => workspaceProbe!.chooseTool("line"));
      const screen = pageToScreen({ x: 200, y: 300 }, transform());
      expect(screenToPage(screen, transform())).toEqual({ x: 200, y: 300 });
      await click({ x: 200, y: 300 });
      await click({ x: 260, y: 300 });
      expectPoints(measurements()[0]!.points, [
        { x: 200, y: 300 },
        { x: 260, y: 300 },
      ]);
    });
  });

  describe("selection", () => {
    async function mountWithLine() {
      await mount(createCalibratedSession());
      await act(async () => workspaceProbe!.chooseTool("line"));
      await click({ x: 20, y: 20 });
      await click({ x: 120, y: 20 });
      await act(async () => workspaceProbe!.chooseTool("select"));
      return measurements()[0]!.id;
    }

    it("selects through the annotation layer and clears with a click on the empty page background", async () => {
      const id = await mountWithLine();
      await act(async () => workspaceProbe!.clearSelection());
      expect(workspaceProbe!.selectedMeasurementId).toBeNull();
      await act(async () =>
        (lastAnnotationLayer().onSelectMeasurement as (id: string) => void)(id),
      );
      expect(workspaceProbe!.selectedMeasurementId).toBe(id);
      expect(lastAnnotationLayer().selectedMeasurementId).toBe(id);
      await act(async () =>
        stageHandler("onClick")(konvaPointerEvent({ x: 5, y: 5 }, { onStage: true })),
      );
      expect(workspaceProbe!.selectedMeasurementId).toBeNull();
      expect(measurements()).toHaveLength(1);
    });

    it("does not deselect when a click lands on a shape instead of the background", async () => {
      const id = await mountWithLine();
      expect(workspaceProbe!.selectedMeasurementId).toBe(id);
      await act(async () => stageHandler("onClick")(konvaPointerEvent({ x: 300, y: 300 })));
      expect(workspaceProbe!.selectedMeasurementId).toBe(id);
    });

    it("supports additive multi-selection from the annotation layer", async () => {
      await mount(createCalibratedSession());
      await act(async () => workspaceProbe!.chooseTool("line"));
      await click({ x: 20, y: 20 });
      await click({ x: 120, y: 20 });
      await click({ x: 20, y: 60 });
      await click({ x: 120, y: 60 });
      const [first, second] = measurements().map((measurement) => measurement.id);
      await act(async () => workspaceProbe!.chooseTool("select"));
      const select = lastAnnotationLayer().onSelectMeasurement as (
        id: string,
        additive?: boolean,
      ) => void;
      await act(async () => select(first!));
      await act(async () => select(second!, true));
      expect(workspaceProbe!.selectedMeasurementIds).toEqual([first, second]);
    });
  });

  describe("zoom and pan", () => {
    it("zooms with the wheel around the pointer, keeping the page point under it fixed", async () => {
      const frames = installManualAnimationFrames();
      await mount(createCalibratedSession());
      const before = transform();
      const pointer = { x: 700, y: 250 };
      const anchor = screenToPage(pointer, before);
      await act(async () => stageHandler("onWheel")(konvaPointerEvent(pointer, { deltaY: -200 })));
      await act(async () => frames.flush());
      const after = transform();
      expect(after.zoom).toBeCloseTo(before.zoom * Math.exp(0.2), 6);
      const back = pageToScreen(anchor, after);
      expect(back.x).toBeCloseTo(pointer.x, 6);
      expect(back.y).toBeCloseTo(pointer.y, 6);
      expect(viewZoomReports.at(-1)).toEqual([1, after.zoom]);
    });

    it("coalesces wheel events of one frame and zooms out for positive deltas", async () => {
      const frames = installManualAnimationFrames();
      await mount(createCalibratedSession());
      const before = transform();
      await act(async () => {
        stageHandler("onWheel")(konvaPointerEvent({ x: 500, y: 350 }, { deltaY: -100 }));
        stageHandler("onWheel")(konvaPointerEvent({ x: 500, y: 350 }, { deltaY: -100 }));
      });
      await act(async () => frames.flush());
      expect(transform().zoom).toBeCloseTo(before.zoom * Math.exp(0.2), 6);
      const zoomed = transform().zoom;
      await act(async () =>
        stageHandler("onWheel")(konvaPointerEvent({ x: 500, y: 350 }, { deltaY: 300 })),
      );
      await act(async () => frames.flush());
      expect(transform().zoom).toBeCloseTo(zoomed * Math.exp(-0.3), 6);
    });

    it("pans with the hand tool without changing zoom and stops after mouse up", async () => {
      await mount(createCalibratedSession());
      await act(async () => workspaceProbe!.chooseTool("hand"));
      const before = transform();
      await act(async () => stageHandler("onMouseDown")(konvaPointerEvent({ x: 400, y: 300 })));
      await act(async () => stageHandler("onMouseMove")(konvaPointerEvent({ x: 460, y: 340 })));
      await act(async () => stageHandler("onMouseUp")(konvaPointerEvent({ x: 460, y: 340 })));
      const panned = transform();
      expect(panned.zoom).toBe(before.zoom);
      expect(panned.panX).toBeCloseTo(before.panX + 60, 6);
      expect(panned.panY).toBeCloseTo(before.panY + 40, 6);
      await act(async () => stageHandler("onMouseMove")(konvaPointerEvent({ x: 900, y: 600 })));
      expect(transform()).toEqual(panned);
    });

    it("pans with the middle button while a drawing tool is active and does not place a point", async () => {
      await mount(createCalibratedSession());
      await act(async () => workspaceProbe!.chooseTool("polyline"));
      const before = transform();
      await act(async () =>
        stageHandler("onMouseDown")(konvaPointerEvent({ x: 400, y: 300 }, { button: 1 })),
      );
      await act(async () => stageHandler("onMouseMove")(konvaPointerEvent({ x: 380, y: 310 })));
      // El navegador entrega el clic justo tras mouseup, antes del temporizador que lo deja de suprimir.
      await act(async () => {
        stageHandler("onMouseUp")(konvaPointerEvent({ x: 380, y: 310 }));
        stageHandler("onClick")(konvaPointerEvent({ x: 380, y: 310 }));
      });
      expect(transform().panX).toBeCloseTo(before.panX - 20, 6);
      expect(transform().panY).toBeCloseTo(before.panY + 10, 6);
      expect(workspaceProbe!.draft).toBeNull();
    });

    it("zooms with the navigation controls and returns to the fit view", async () => {
      await mount(createCalibratedSession());
      const fit = transform();
      await act(async () => navigation!.onZoomIn());
      expect(transform().zoom).toBeCloseTo(fit.zoom * 1.25, 6);
      expect(navigation!.zoom).toBeCloseTo(fit.zoom * 1.25, 6);
      await act(async () => navigation!.onZoomOut());
      await act(async () => navigation!.onZoomOut());
      expect(transform().zoom).toBeCloseTo(fit.zoom / 1.25, 6);
      await act(async () => navigation!.onFit());
      expect(transform()).toEqual(fit);
    });
  });

  describe("page changes", () => {
    it("shows the requested page, resets to its fit view and reports the zoom for that page", async () => {
      const pdf = createPdfDocument({
        1: createPdfPage(),
        2: createPdfPage({ width: 400, height: 400 }),
      });
      await mount(createCalibratedSession(2), pdf);
      expect(navigation).toMatchObject({ pageNumber: 1, pageCount: 2 });
      const fitOne = transform();
      await act(async () => navigation!.onZoomIn());
      expect(transform().zoom).toBeGreaterThan(fitOne.zoom);
      await act(async () => navigation!.onPageChange(2));
      expect(navigation!.pageNumber).toBe(2);
      expect(container.querySelector('canvas[aria-label="PDF page 2"]')).not.toBeNull();
      expect(container.querySelector('canvas[aria-label="PDF page 1"]')).toBeNull();
      expect(pdf.getPage).toHaveBeenLastCalledWith(2);
      // 400x400 en 1000x700 con 24 px de margen: limita la altura.
      expect(transform().zoom).toBeCloseTo((VIEWER_HEIGHT - 48) / 400, 6);
      expect(viewZoomReports.at(-1)![0]).toBe(2);
      await act(async () => navigation!.onPageChange(1));
      expect(transform().zoom).toBeCloseTo(fitOne.zoom, 6);
    });

    it("draws on the active page only and keeps measurements of other pages intact", async () => {
      const pdf = createPdfDocument({ 1: createPdfPage(), 2: createPdfPage() });
      await mount(createCalibratedSession(2), pdf);
      await act(async () => navigation!.onPageChange(2));
      await act(async () => workspaceProbe!.chooseTool("count"));
      await click({ x: 70, y: 80 });
      expect(measurements(1)).toHaveLength(0);
      expect(measurements(2)).toHaveLength(1);
      expectPoints(measurements(2)[0]!.points, [{ x: 70, y: 80 }]);
    });
  });
});
