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

// Every font string a Text builds (each layout, measure and draw) normalizes its font family again:
// split, trim, quote and join. Konva's own string is kept for each family, minus its prefix.
const contextFont = Text.prototype._getContextFont;
const normalizedFamilies = new Map<string, string>();

Text.prototype._getContextFont = function _getContextFont(this: Text): string {
  const family = this.fontFamily();
  const prefix = `${this.fontStyle()} ${this.fontVariant()} ${this.fontSize()}px `;
  let normalized = normalizedFamilies.get(family);
  if (normalized === undefined) {
    const font = contextFont.call(this);
    if (!font.startsWith(prefix)) return font;
    normalized = font.slice(prefix.length);
    if (normalizedFamilies.size >= MAX_CACHED_SAMPLE_FONTS) normalizedFamilies.clear();
    normalizedFamilies.set(family, normalized);
  }
  return prefix + normalized;
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
type BatchedLabel = Label & {
  _syncDeferred?: boolean;
  _syncPending?: boolean;
  _syncRunning?: boolean;
};
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

// Label binds _sync in its constructor, so the bound listener runs this override. The sync reads
// only the Text size and the Tag pointer attrs and writes the Tag size and both positions, so the
// Tag size change it fires itself cannot change its result and is ignored.
Label.prototype._sync = function _sync(this: BatchedLabel): void {
  if (this._syncRunning) return;
  if (this._syncDeferred) {
    this._syncPending = true;
    return;
  }
  this._syncRunning = true;
  try {
    syncLabel.call(this);
  } finally {
    this._syncRunning = false;
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
