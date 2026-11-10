import { Group as KonvaGroup } from "konva/lib/Group";
import { Layer as KonvaLayer } from "konva/lib/Layer";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Label as KonvaLabelNode } from "konva/lib/shapes/Label";
import type { LogicalPageBounds, Measurement, Point, ViewTransform } from "../../types/domain";
import { LABEL_EDGE_MARGIN_SCREEN_PX, placeLabelWithinBounds } from "../../utils/labelLayout";
import { withoutKonvaAutoDraw } from "./annotationKonva";
import {
  MEASUREMENT_WHOLE_DRAG_DISTANCE_SCREEN_PX,
  pageDeltaFromScreenDrag,
} from "./measurementDrag";

// Loaded on demand: only a selected measurement's label can be dragged.

/** The latest props of the measurement; a tuple because it is rebuilt on every render. */
export type LabelDragContext = [
  measurement: Measurement,
  pageNumber: number,
  transform: ViewTransform,
  zoom: number,
  bounds: LogicalPageBounds,
  setLabelOffset: (pageNumber: number, id: string, offset: Point) => boolean,
  onEditActiveChange: (measurementId: string, active: boolean) => void,
  onCancellationChange: (measurementId: string, cancel: (() => void) | null) => void,
];

/**
 * Drags a label on a layer of its own, so the annotation layer is not redrawn per move: the label
 * is hidden and pinned in place while a clone follows the pointer.
 */
function beginPreview(label: KonvaLabelNode, [, , transform, zoom, bounds]: LabelDragContext) {
  const stage = label.getStage();
  if (!stage) return null;
  const layer = new KonvaLayer({ listening: false });
  const clone = label.clone({ listening: false, draggable: false });
  withoutKonvaAutoDraw(() => {
    const page = new KonvaGroup({
      x: transform.panX,
      y: transform.panY,
      scaleX: zoom,
      scaleY: zoom,
      clipX: 0,
      clipY: 0,
      clipWidth: bounds.width,
      clipHeight: bounds.height,
      listening: false,
    });
    layer.add(page);
    page.add(clone);
    stage.add(layer);
  });
  const pinned = label.getAbsolutePosition();
  const bound = label.dragBoundFunc();
  label.visible(false);
  label.dragBoundFunc(() => pinned);
  return {
    move: (position: Point) => clone.position(position),
    end() {
      label.setAttr("dragBoundFunc", bound);
      label.visible(true);
      layer.destroy();
    },
  };
}

type Event = KonvaEventObject<MouseEvent | TouchEvent>;

/** Stable listeners for the label: a click selects, a drag moves it, Escape cancels. */
export function createLabelDrag(getContext: () => LabelDragContext) {
  let drag: {
    node: KonvaLabelNode;
    start: Point;
    origin: Point;
    preview: ReturnType<typeof beginPreview>;
    cancelled: boolean;
  } | null = null;

  const pointerOf = (event: Event) => event.target.getStage()?.getPointerPosition() ?? null;

  function positionAt(pointer: Point): Point {
    const [, , transform, zoom, bounds] = getContext();
    const { node, origin, start } = drag!;
    const delta = pageDeltaFromScreenDrag(start, pointer, transform);
    const width = node.width();
    const height = node.height();
    // The page clamp takes the label's center and returns its top-left corner.
    return placeLabelWithinBounds(
      { x: origin.x + delta.x + width / 2, y: origin.y + delta.y + height / 2 },
      { width, height },
      bounds,
      zoom,
      LABEL_EDGE_MARGIN_SCREEN_PX,
    );
  }

  function finish(event: Event) {
    event.cancelBubble = true;
    const current = drag;
    if (!current) return;
    const pointer = pointerOf(event);
    const position = !current.cancelled && pointer ? positionAt(pointer) : null;
    drag = null;
    const [{ id, labelOffset }, pageNumber, , , , setLabelOffset, onEditActiveChange, onCancel] =
      getContext();
    if (position && (position.x !== current.origin.x || position.y !== current.origin.y)) {
      // The offset is from the default placement, which is where the label rests minus its offset.
      current.node.position(position);
      setLabelOffset(pageNumber, id, {
        x: position.x - current.origin.x + (labelOffset?.x ?? 0),
        y: position.y - current.origin.y + (labelOffset?.y ?? 0),
      });
    }
    current.preview?.end();
    onCancel(id, null);
    onEditActiveChange(id, false);
  }

  const handlers = {
    dragDistance: MEASUREMENT_WHOLE_DRAG_DISTANCE_SCREEN_PX,
    onMouseDown: (event: KonvaEventObject<MouseEvent>) => {
      if (event.evt.button !== 0) return;
      prepare(event);
    },
    onTouchStart: (event: KonvaEventObject<TouchEvent>) => prepare(event),
    onDragStart(event: Event) {
      event.cancelBubble = true;
      if (!drag) {
        event.target.stopDrag();
        return;
      }
      const current = drag;
      const context = getContext();
      const id = context[0].id;
      current.preview = beginPreview(current.node, context);
      context[6](id, true);
      context[7](id, () => {
        current.cancelled = true;
        current.node.stopDrag();
      });
    },
    onDragMove(event: Event) {
      event.cancelBubble = true;
      const pointer = pointerOf(event);
      if (drag && pointer) drag.preview?.move(positionAt(pointer));
    },
    onDragEnd: finish,
  };

  function prepare(event: Event) {
    const start = pointerOf(event);
    const node = event.currentTarget as KonvaLabelNode;
    if (start) drag = { node, start, origin: node.position(), preview: null, cancelled: false };
  }

  return { listeners: handlers, dispose: () => drag?.preview?.end() };
}

export type LabelDrag = ReturnType<typeof createLabelDrag>;
