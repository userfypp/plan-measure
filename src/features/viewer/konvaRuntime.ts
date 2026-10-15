// The "konva" entry bundles every shape and filter. vite.config.ts aliases it to this module, which
// registers only the nodes Plan Measure renders through react-konva (Stage, Layer, Group and Shape
// are part of the core). Register a new node here before using it.
import Konva from "konva/lib/Core";
import "konva/lib/shapes/Circle";
import "konva/lib/shapes/Label";
import "konva/lib/shapes/Line";
import "konva/lib/shapes/Rect";
import { Text } from "konva/lib/shapes/Text";

// Every Text draw measures a sample "M" to place its baseline, which costs a font parse and a
// measureText per label per redraw. The sample depends only on the font, so it is measured once
// per font string and measured again after web fonts finish loading.
type TextSize = ReturnType<Text["measureSize"]>;
const BASELINE_SAMPLE = "M";
const MAX_CACHED_SAMPLE_FONTS = 256;
const measureTextSize = Text.prototype.measureSize;
const sampleSizes = new Map<string, TextSize>();

Text.prototype.measureSize = function measureSize(this: Text, text: string): TextSize {
  if (text !== BASELINE_SAMPLE) return measureTextSize.call(this, text);
  const font = this._getContextFont();
  let size = sampleSizes.get(font);
  if (!size) {
    size = measureTextSize.call(this, text);
    if (sampleSizes.size >= MAX_CACHED_SAMPLE_FONTS) sampleSizes.clear();
    sampleSizes.set(font, size);
  }
  return { ...size };
};

if (typeof document !== "undefined" && "fonts" in document) {
  document.fonts.addEventListener("loadingdone", () => sampleSizes.clear());
}

export default Konva;
