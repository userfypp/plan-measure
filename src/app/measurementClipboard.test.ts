import { describe, expect, it, vi } from "vitest";
import type { Measurement } from "../types/domain";
import {
  canDuplicateMeasurement,
  duplicateMeasurement,
  isMeasurementClipboardActionBlocked,
  MEASUREMENT_DUPLICATE_OFFSET_SCREEN_PX,
  measurementClipboardFitsPage,
  offsetMeasurementForSamePageDuplicate,
  pasteMeasurementClipboard,
  registerMeasurementClipboardInvalidation,
} from "./measurementClipboard";
import type { PasteMeasurementCommand } from "./sessionState";

const measurement: Measurement = {
  id: "source",
  type: "line",
  name: "Source",
  calibrationId: "scale-1",
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ],
  classificationValueIds: ["trade-value"],
  visible: true,
};

describe("measurement clipboard orchestration", () => {
  it.each([
    [
      "line",
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    ],
    [
      "polyline",
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
    ],
    [
      "polygon",
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
    ],
  ] as const)("allows a valid %s to be duplicated on its calibrated page", (type, points) => {
    const candidate: Measurement = {
      ...measurement,
      type,
      points: points.map((point) => ({ ...point })),
    };
    const page = {
      calibrations: [
        {
          id: "scale-1",
          name: "Scale 1",
          mode: "uniform" as const,
          start: { x: 0, y: 0 },
          end: { x: 10, y: 0 },
          referenceDistanceMm: 1000,
        },
      ],
    };

    expect(canDuplicateMeasurement(page, candidate)).toBe(true);
  });

  it("disables duplication for repair-required Polygon geometry and a missing source scale", () => {
    const page = {
      calibrations: [
        {
          id: "scale-1",
          name: "Scale 1",
          mode: "uniform" as const,
          start: { x: 0, y: 0 },
          end: { x: 10, y: 0 },
          referenceDistanceMm: 1000,
        },
      ],
    };
    const repairRequired: Measurement = {
      ...measurement,
      type: "polygon",
      points: [
        { x: 0, y: 0 },
        { x: 4, y: 4 },
        { x: 0, y: 4 },
        { x: 4, y: 0 },
      ],
    };

    expect(canDuplicateMeasurement(page, repairRequired)).toBe(false);
    expect(
      canDuplicateMeasurement(page, { ...measurement, calibrationId: "missing-scale" }),
    ).toBe(false);
  });

  it.each([
    [
      "line",
      [
        { x: 10, y: 10 },
        { x: 30, y: 10 },
      ],
    ],
    [
      "polyline",
      [
        { x: 10, y: 10 },
        { x: 30, y: 10 },
        { x: 30, y: 25 },
      ],
    ],
    [
      "polygon",
      [
        { x: 10, y: 10 },
        { x: 30, y: 10 },
        { x: 30, y: 25 },
        { x: 10, y: 25 },
      ],
    ],
  ] as const)(
    "offsets same-page %s paste by a screen-space-consistent translation without changing metadata",
    (type, points) => {
      const source: Measurement = {
        ...measurement,
        type,
        name: "Preserved",
        calibrationId: "source-scale",
        classificationValueIds: ["archived-value"],
        points: points.map((point) => ({ ...point })),
      };
      const sourceBefore = structuredClone(source);
      const pasteMeasurement = vi
        .fn<(command: PasteMeasurementCommand) => boolean>()
        .mockReturnValue(true);
      const selectMeasurement = vi.fn();

      pasteMeasurementClipboard({
        clipboard: { sourcePageNumber: 1, measurement: source },
        pageNumber: 1,
        destinationBounds: { width: 100, height: 100, rotation: 0 },
        destinationZoom: 2,
        pasteMeasurement,
        selectMeasurement,
        createId: () => `${type}-copy`,
      });

      const command = pasteMeasurement.mock.calls[0]![0];
      const delta = MEASUREMENT_DUPLICATE_OFFSET_SCREEN_PX / 2;
      expect(command.measurement).toEqual({
        ...sourceBefore,
        points: sourceBefore.points.map((point) => ({ x: point.x + delta, y: point.y + delta })),
      });
      expect(
        command.measurement.points.slice(1).map((point, index) => ({
          x: point.x - command.measurement.points[index]!.x,
          y: point.y - command.measurement.points[index]!.y,
        })),
      ).toEqual(
        sourceBefore.points.slice(1).map((point, index) => ({
          x: point.x - sourceBefore.points[index]!.x,
          y: point.y - sourceBefore.points[index]!.y,
        })),
      );
      expect(source).toEqual(sourceBefore);
      expect(selectMeasurement).toHaveBeenCalledWith(`${type}-copy`);
    },
  );

  it("uses up-left at page bounds and otherwise preserves the original position", () => {
    const bounds = { width: 100, height: 100, rotation: 0 } as const;
    const nearBottomRight: Measurement = {
      ...measurement,
      points: [
        { x: 85, y: 85 },
        { x: 95, y: 90 },
      ],
    };
    const upLeft = offsetMeasurementForSamePageDuplicate(nearBottomRight, bounds, 1);
    expect(upLeft.points).toEqual(
      nearBottomRight.points.map((point) => ({
        x: point.x - MEASUREMENT_DUPLICATE_OFFSET_SCREEN_PX,
        y: point.y - MEASUREMENT_DUPLICATE_OFFSET_SCREEN_PX,
      })),
    );

    const spanningPage: Measurement = {
      ...measurement,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ],
    };
    expect(offsetMeasurementForSamePageDuplicate(spanningPage, bounds, 1)).toBe(spanningPage);
  });

  it("keeps the visual offset constant across zoom levels and accepts exact page boundaries", () => {
    const bounds = { width: 100, height: 100, rotation: 90 } as const;
    for (const zoom of [0.5, 1, 2, 4]) {
      const source: Measurement = {
        ...measurement,
        points: [
          { x: 30, y: 30 },
          { x: 60, y: 60 },
        ],
      };
      const shifted = offsetMeasurementForSamePageDuplicate(source, bounds, zoom);
      const pageDelta = shifted.points[0]!.x - source.points[0]!.x;
      expect(pageDelta * zoom).toBe(MEASUREMENT_DUPLICATE_OFFSET_SCREEN_PX);
    }

    const boundarySource: Measurement = {
      ...measurement,
      points: [
        { x: 10, y: 10 },
        { x: 88, y: 88 },
      ],
    };
    expect(offsetMeasurementForSamePageDuplicate(boundarySource, bounds, 1).points[1]).toEqual({
      x: 100,
      y: 100,
    });
  });

  it("invokes the existing paste path, selects the new measurement, and cascades repeated Duplicate", () => {
    const ids = ["copy-1", "copy-2"];
    const pasteMeasurement = vi
      .fn<(command: PasteMeasurementCommand) => boolean>()
      .mockReturnValue(true);
    const selectMeasurement = vi.fn();
    const createId = () => ids.shift()!;
    const bounds = { width: 100, height: 100, rotation: 0 } as const;
    const sourceBefore = structuredClone(measurement);

    duplicateMeasurement({
      measurement,
      pageNumber: 1,
      destinationBounds: bounds,
      destinationZoom: 1,
      pasteMeasurement,
      selectMeasurement,
      createId,
    });
    const firstCommand = pasteMeasurement.mock.calls[0]![0];
    expect(firstCommand).toMatchObject({
      pageNumber: 1,
      id: "copy-1",
      sourcePageNumber: 1,
    });
    expect(selectMeasurement).toHaveBeenCalledWith("copy-1");
    const firstCopy: Measurement = { ...firstCommand.measurement, id: firstCommand.id };
    duplicateMeasurement({
      measurement: firstCopy,
      pageNumber: 1,
      destinationBounds: bounds,
      destinationZoom: 1,
      pasteMeasurement,
      selectMeasurement,
      createId,
    });

    const secondCommand = pasteMeasurement.mock.calls[1]![0];
    expect(firstCommand.measurement.points[0]).toEqual({ x: 12, y: 12 });
    expect(secondCommand.measurement.points[0]).toEqual({ x: 24, y: 24 });
    expect(firstCommand.measurement).toMatchObject({
      name: measurement.name,
      calibrationId: measurement.calibrationId,
      classificationValueIds: measurement.classificationValueIds,
    });
    expect(secondCommand.measurement).toMatchObject({
      name: measurement.name,
      calibrationId: measurement.calibrationId,
      classificationValueIds: measurement.classificationValueIds,
    });
    expect(measurement).toEqual(sourceBefore);
    expect(selectMeasurement.mock.calls.map(([id]) => id)).toEqual(["copy-1", "copy-2"]);
  });

  it("blocks paste during transient drawing/calibration workflows and all clipboard actions during vertex edits", () => {
    const idle = {
      measurementEditActive: false,
      draftActive: false,
      calibrationFlowActive: false,
      calibrationCandidateActive: false,
      calibrationReferenceEditActive: false,
    };
    expect(isMeasurementClipboardActionBlocked("copy-measurement", idle)).toBe(false);
    expect(isMeasurementClipboardActionBlocked("paste-measurement", idle)).toBe(false);
    expect(
      isMeasurementClipboardActionBlocked("copy-measurement", {
        ...idle,
        measurementEditActive: true,
      }),
    ).toBe(true);
    for (const key of [
      "draftActive",
      "calibrationFlowActive",
      "calibrationCandidateActive",
      "calibrationReferenceEditActive",
    ] as const) {
      expect(
        isMeasurementClipboardActionBlocked("paste-measurement", { ...idle, [key]: true }),
      ).toBe(true);
    }
  });

  it("invalidates the application clipboard for native copy/cut and window blur", () => {
    const documentTarget = new EventTarget();
    const windowTarget = new EventTarget();
    const clearClipboard = vi.fn();
    let applicationCopyInProgress = false;
    const unregister = registerMeasurementClipboardInvalidation({
      documentTarget,
      windowTarget,
      applicationCopyInProgress: () => applicationCopyInProgress,
      clearClipboard,
    });

    documentTarget.dispatchEvent(new Event("copy"));
    documentTarget.dispatchEvent(new Event("cut"));
    expect(clearClipboard).toHaveBeenCalledTimes(2);

    applicationCopyInProgress = true;
    documentTarget.dispatchEvent(new Event("copy"));
    expect(clearClipboard).toHaveBeenCalledTimes(2);

    windowTarget.dispatchEvent(new Event("blur"));
    expect(clearClipboard).toHaveBeenCalledTimes(3);

    unregister();
    documentTarget.dispatchEvent(new Event("copy"));
    windowTarget.dispatchEvent(new Event("blur"));
    expect(clearClipboard).toHaveBeenCalledTimes(3);
  });

  it("requires preserved cross-page geometry to fit the loaded destination page", () => {
    const clipboard = { sourcePageNumber: 1, measurement };
    expect(measurementClipboardFitsPage(clipboard, 1, null)).toBe(true);
    expect(measurementClipboardFitsPage(clipboard, 2, null)).toBe(false);
    expect(measurementClipboardFitsPage(clipboard, 2, { width: 10, height: 10, rotation: 0 })).toBe(
      true,
    );
    expect(measurementClipboardFitsPage(clipboard, 2, { width: 9, height: 10, rotation: 0 })).toBe(
      false,
    );
  });

  it("selects the newly pasted measurement and returns its unique ID", () => {
    const pasteMeasurement = vi
      .fn<(command: PasteMeasurementCommand) => boolean>()
      .mockReturnValue(true);
    const selectMeasurement = vi.fn();

    const id = pasteMeasurementClipboard({
      clipboard: { sourcePageNumber: 1, measurement },
      pageNumber: 2,
      destinationBounds: { width: 100, height: 100, rotation: 0 },
      destinationZoom: 0.25,
      pasteMeasurement,
      selectMeasurement,
      createId: () => "copy-1",
    });

    expect(id).toBe("copy-1");
    expect(pasteMeasurement).toHaveBeenCalledWith({
      pageNumber: 2,
      id: "copy-1",
      sourcePageNumber: 1,
      measurement,
    });
    expect(selectMeasurement).toHaveBeenCalledWith("copy-1");
  });

  it("does not change selection when paste is rejected", () => {
    const selectMeasurement = vi.fn();

    expect(
      pasteMeasurementClipboard({
        clipboard: { sourcePageNumber: 1, measurement },
        pageNumber: 2,
        pasteMeasurement: () => false,
        selectMeasurement,
        createId: () => "rejected-copy",
      }),
    ).toBeNull();
    expect(selectMeasurement).not.toHaveBeenCalled();
  });

  it("requests a fresh ID for every repeated paste", () => {
    const ids = ["copy-1", "copy-2"];
    const pasteMeasurement = vi
      .fn<(command: PasteMeasurementCommand) => boolean>()
      .mockReturnValue(true);
    const selectMeasurement = vi.fn();
    const createId = vi.fn(() => ids.shift()!);

    for (let index = 0; index < 2; index += 1) {
      pasteMeasurementClipboard({
        clipboard: { sourcePageNumber: 1, measurement },
        pageNumber: 1,
        pasteMeasurement,
        selectMeasurement,
        createId,
      });
    }

    expect(createId).toHaveBeenCalledTimes(2);
    expect(pasteMeasurement.mock.calls.map(([command]) => command.id)).toEqual([
      "copy-1",
      "copy-2",
    ]);
    expect(selectMeasurement.mock.calls.map(([id]) => id)).toEqual(["copy-1", "copy-2"]);
  });

  it("keeps repeated keyboard-style paste as one predictable offset from the copied snapshot", () => {
    const pasteMeasurement = vi
      .fn<(command: PasteMeasurementCommand) => boolean>()
      .mockReturnValue(true);
    const selectMeasurement = vi.fn();
    const ids = ["copy-1", "copy-2"];
    const clipboard = { sourcePageNumber: 1, measurement };

    for (let index = 0; index < 2; index += 1) {
      pasteMeasurementClipboard({
        clipboard,
        pageNumber: 1,
        destinationBounds: { width: 100, height: 100, rotation: 0 },
        destinationZoom: 1,
        pasteMeasurement,
        selectMeasurement,
        createId: () => ids.shift()!,
      });
    }

    expect(pasteMeasurement.mock.calls[0]![0].measurement.points).toEqual(
      pasteMeasurement.mock.calls[1]![0].measurement.points,
    );
    expect(pasteMeasurement.mock.calls[0]![0].measurement.points[0]).toEqual({ x: 12, y: 12 });
  });
});
