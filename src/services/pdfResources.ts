/**
 * Locations pdf.js loads on demand: image decoders for CCITT, JBIG2 and JPEG 2000 (scanned plans),
 * predefined CMaps, the standard fonts and the ICC data. Without them those images are dropped
 * silently and CJK text and colour profiles degrade. `base` must end with a slash.
 */
export function pdfResourceOptions(base: string) {
  return {
    cMapUrl: `${base}cmaps/`,
    standardFontDataUrl: `${base}standard_fonts/`,
    wasmUrl: `${base}wasm/`,
    iccUrl: `${base}iccs/`,
  };
}
