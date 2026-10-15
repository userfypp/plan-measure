// The "konva" entry bundles every shape and filter. vite.config.ts aliases it to this module, which
// registers only the nodes Plan Measure renders through react-konva (Stage, Layer, Group and Shape
// are part of the core). Register a new node here before using it.
import Konva from "konva/lib/Core";
import "konva/lib/shapes/Circle";
import { Label } from "konva/lib/shapes/Label";
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

// Each size attr a Text receives re-runs its text layout, and inside a Label also re-syncs the Tag,
// whose own size change syncs again. A zoom changes fontSize and padding on every label, so one
// setAttrs ran the layout twice and the sync about six times. Both are pure functions of the final
// attrs, so a Text defers them until its setAttrs returns and then runs each once. Individual
// setters outside setAttrs still update immediately.
type BatchedText = Text & { _attrsBatched?: boolean; _textDataPending?: boolean };
type BatchedLabel = Label & { _syncDeferred?: boolean; _syncPending?: boolean };
const setTextAttrs = Text.prototype.setAttrs;
const setTextData = Text.prototype._setTextData;
const syncLabel = Label.prototype._sync;

Text.prototype._setTextData = function _setTextData(this: BatchedText): void {
  if (this._attrsBatched) {
    this._textDataPending = true;
    return;
  }
  setTextData.call(this);
};

// Label binds _sync in its constructor, so the bound listener runs this override. The Tag size the
// sync sets would re-enter it; that request reruns the sync once it returns instead, until a pass
// changes nothing.
Label.prototype._sync = function _sync(this: BatchedLabel): void {
  if (this._syncDeferred) {
    this._syncPending = true;
    return;
  }
  this._syncDeferred = true;
  try {
    do {
      this._syncPending = false;
      syncLabel.call(this);
    } while (this._syncPending);
  } finally {
    this._syncDeferred = false;
  }
};

Text.prototype.setAttrs = function setAttrs(this: BatchedText, config) {
  if (this._attrsBatched) return setTextAttrs.call(this, config);
  const label = this.parent instanceof Label ? (this.parent as BatchedLabel) : null;
  const deferLabelSync = label !== null && !label._syncDeferred;
  this._attrsBatched = true;
  if (deferLabelSync) label._syncDeferred = true;
  try {
    setTextAttrs.call(this, config);
  } finally {
    this._attrsBatched = false;
    if (this._textDataPending) {
      this._textDataPending = false;
      setTextData.call(this);
    }
    if (deferLabelSync) {
      label._syncDeferred = false;
      if (label._syncPending) {
        label._syncPending = false;
        label._sync();
      }
    }
  }
  return this;
};

export default Konva;
