// @vitest-environment jsdom
import Konva from "konva";
import { Util } from "konva/lib/Util";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { flushBatchDraw } from "./konvaRuntime";

// jsdom has no 2D context. These tests count draws and never paint, so every context method is a
// no-op.
beforeAll(() => {
  const context = new Proxy({} as Record<string | symbol, unknown>, {
    get: (target, key) => (key in target ? target[key] : () => undefined),
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
});

let frames: Array<() => void> = [];

beforeEach(() => {
  frames = [];
  vi.spyOn(Util, "requestAnimFrame").mockImplementation((callback) => {
    frames.push(callback as () => void);
  });
});

afterEach(() => {
  vi.mocked(Util.requestAnimFrame).mockRestore();
});

function runFrames() {
  for (const frame of frames.splice(0)) frame();
}

function countedLayer() {
  const layer = new Konva.Layer();
  const scene = vi.spyOn(layer, "drawScene").mockReturnThis();
  const hit = vi.spyOn(layer, "drawHit").mockReturnThis();
  return { layer, scene, hit };
}

describe("layer batch draw", () => {
  it("draws batched requests once, in the next frame", () => {
    const { layer, scene, hit } = countedLayer();

    layer.batchDraw();
    layer.batchDraw();
    expect(frames).toHaveLength(1);
    expect(scene).not.toHaveBeenCalled();

    runFrames();
    expect(scene).toHaveBeenCalledTimes(1);
    expect(hit).toHaveBeenCalledTimes(1);
  });

  it("skips the frame when a synchronous draw already showed every request", () => {
    const { layer, scene, hit } = countedLayer();

    layer.batchDraw();
    layer.draw();
    runFrames();

    expect(scene).toHaveBeenCalledTimes(1);
    expect(hit).toHaveBeenCalledTimes(1);
  });

  it("still draws a request made after the synchronous draw", () => {
    const { layer, scene } = countedLayer();

    layer.batchDraw();
    layer.draw();
    layer.batchDraw();
    expect(frames).toHaveLength(1);
    runFrames();

    expect(scene).toHaveBeenCalledTimes(2);
  });

  it("keeps the frame when only the scene or the hit graph was drawn", () => {
    const { layer, scene, hit } = countedLayer();

    layer.batchDraw();
    layer.drawScene();
    layer.drawHit();
    runFrames();

    expect(scene).toHaveBeenCalledTimes(2);
    expect(hit).toHaveBeenCalledTimes(2);
  });

  it("draws again in the next frame when a draw requests it", () => {
    const { layer, scene } = countedLayer();
    scene.mockImplementationOnce(function (this: typeof layer) {
      this.batchDraw();
      return this;
    });

    layer.batchDraw();
    runFrames();
    expect(scene).toHaveBeenCalledTimes(1);
    expect(frames).toHaveLength(1);

    runFrames();
    expect(scene).toHaveBeenCalledTimes(2);
    expect(frames).toHaveLength(0);
  });

  it("requests a new frame after a draw that throws", () => {
    const { layer, scene } = countedLayer();
    scene.mockImplementationOnce(() => {
      throw new Error("lost context");
    });

    layer.batchDraw();
    expect(runFrames).toThrow("lost context");

    layer.batchDraw();
    expect(frames).toHaveLength(1);
    runFrames();
    expect(scene).toHaveBeenCalledTimes(2);
  });

  it("asks the stage's window for the frame", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const stage = new Konva.Stage({ container, width: 10, height: 10 });
    const { layer } = countedLayer();
    stage.add(layer);
    runFrames();
    vi.mocked(Util.requestAnimFrame).mockClear();

    layer.batchDraw();

    expect(Util.requestAnimFrame).toHaveBeenCalledWith(expect.any(Function), window);
    stage.destroy();
    container.remove();
  });
});

describe("flushBatchDraw", () => {
  it("draws a pending batched draw now, and the frame skips it", () => {
    const { layer, scene } = countedLayer();

    layer.batchDraw();
    flushBatchDraw(layer);
    expect(scene).toHaveBeenCalledTimes(1);

    runFrames();
    expect(scene).toHaveBeenCalledTimes(1);
  });

  it("leaves a layer with nothing pending as it is", () => {
    const { layer, scene } = countedLayer();

    layer.batchDraw();
    runFrames();
    flushBatchDraw(layer);
    layer.draw();
    flushBatchDraw(layer);

    expect(scene).toHaveBeenCalledTimes(2);
  });

  it("draws a layer that was never drawn", () => {
    const { layer, scene } = countedLayer();

    flushBatchDraw(layer);

    expect(scene).toHaveBeenCalledTimes(1);
  });
});
