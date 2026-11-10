import { findSymbolMatches, DEFAULT_MIN_SCORE, type GrayImage } from "./templateMatch";
import type { SymbolSearchRequest, SymbolSearchResponse } from "./symbolSearch";

let image: GrayImage | null = null;

function reply(message: SymbolSearchResponse) {
  postMessage(message);
}

addEventListener("message", (event: MessageEvent<SymbolSearchRequest>) => {
  const request = event.data;
  if (request.type === "init") {
    image = request.image;
    return;
  }
  if (!image) {
    reply({ type: "error", message: "The page was not loaded for the search." });
    return;
  }
  try {
    let lastReported = -1;
    const result = findSymbolMatches(image, request.box, {
      orientations: request.orientations,
      minScore: DEFAULT_MIN_SCORE,
      onProgress: (fraction) => {
        const percent = Math.floor(fraction * 100);
        if (percent === lastReported) return;
        lastReported = percent;
        reply({ type: "progress", fraction });
      },
    });
    reply({ type: "result", result });
  } catch {
    reply({ type: "error", message: "The search could not finish." });
  }
});
