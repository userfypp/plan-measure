// @vitest-environment jsdom
import Konva from "konva";
import { beforeAll, describe, expect, it, vi } from "vitest";

// jsdom has no 2D context: measure each glyph as 0.6 em of the context font size.
beforeAll(() => {
  const context = {
    font: "10px sans-serif",
    fillStyle: "",
    save() {},
    restore() {},
    clearRect() {},
    fillRect() {},
    getImageData: (_x: number, _y: number, width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4).map((_, index) =>
        index % 4 === 3 ? 255 : 40,
      ),
    }),
    measureText(text: string) {
      const fontSize = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 10);
      return { width: text.length * fontSize * 0.6 };
    },
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
});

describe("label text batching", () => {
  const FINAL = { text: "12,50 m\nsecond line", fontSize: 7, padding: 3, lineHeight: 1.4 };

  function label(pointerDirection = "down") {
    const node = new Konva.Label();
    node.add(new Konva.Tag({ pointerDirection, pointerWidth: 6, pointerHeight: 4 }));
    node.add(new Konva.Text({ text: "1 m", fontSize: 12, padding: 5 }));
    return node;
  }

  function layout(node: InstanceType<typeof Konva.Label>) {
    const text = node.getText();
    const tag = node.getTag();
    return {
      text: [text.x(), text.y(), text.width(), text.height(), text.getTextWidth()],
      tag: [tag.x(), tag.y(), tag.width(), tag.height()],
      lines: text.textArr.map((line) => line.text),
    };
  }

  it("lays out once per setAttrs and syncs without cascading, matching per-attr updates", () => {
    for (const direction of ["none", "up", "right", "down", "left"]) {
      const batched = label(direction);
      // One sync pass sets the Tag geometry once; the Tag size it sets does not sync again. Each
      // layout measures its baseline sample once.
      const sync = vi.spyOn(batched.getTag(), "setAttrs");
      const textData = vi.spyOn(batched.getText(), "measureSize");
      batched.getText().setAttrs(FINAL);
      expect(sync).toHaveBeenCalledTimes(1);
      expect(textData).toHaveBeenCalledTimes(1);

      const stepwise = label(direction);
      const text = stepwise.getText();
      text.text(FINAL.text);
      text.fontSize(FINAL.fontSize);
      text.padding(FINAL.padding);
      text.lineHeight(FINAL.lineHeight);
      expect(layout(batched), direction).toEqual(layout(stepwise));
    }
  });

  it("skips the layout and sync when no size attr changes", () => {
    const node = label();
    const sync = vi.spyOn(node.getTag(), "setAttrs");
    const textData = vi.spyOn(node.getText(), "measureSize");
    node.getText().setAttrs({ fill: "red", fontSize: 12 });
    expect(sync).not.toHaveBeenCalled();
    expect(textData).not.toHaveBeenCalled();
  });

  it("keeps individual setters and Tag changes immediate", () => {
    const node = label();
    const text = node.getText();
    text.fontSize(20);
    expect(node.getTag().width()).toBe(text.width());
    expect(node.getTag().height()).toBe(text.height());
    node.getTag().pointerHeight(10);
    expect(text.y()).toBe(-(text.height() + 10));
  });

  it("lays out a Text outside a Label after setAttrs", () => {
    const text = new Konva.Text({ text: "a", fontSize: 10 });
    text.setAttrs({ text: "a\nb\nc", fontSize: 20 });
    expect(text.textArr).toHaveLength(3);
    expect(text.height()).toBe(60);
  });
});
