import type { GrayImage, PixelRect, SymbolMatchResult } from "./templateMatch";

/** Messages between the page and `symbolMatch.worker.ts`. */
export type SymbolSearchRequest =
  { type: "init"; image: GrayImage } | { type: "search"; box: PixelRect; orientations: boolean };

export type SymbolSearchResponse =
  | { type: "progress"; fraction: number }
  | { type: "result"; result: SymbolMatchResult }
  | { type: "error"; message: string };

export interface SymbolSearchCallbacks {
  onProgress: (fraction: number) => void;
  onResult: (result: SymbolMatchResult) => void;
  onError: (message: string) => void;
}

/** A search over one page raster that is kept between searches. */
export interface SymbolSearch {
  search: (box: PixelRect, orientations: boolean) => void;
  terminate: () => void;
}

export type CreateSymbolSearch = (
  image: GrayImage,
  callbacks: SymbolSearchCallbacks,
) => SymbolSearch;

export const SYMBOL_SEARCH_UNAVAILABLE = "Finding similar symbols is not available here.";

/** Runs the search in a module worker; the raster moves to it and stays there. */
export const createSymbolSearch: CreateSymbolSearch = (image, callbacks) => {
  const worker = new Worker(new URL("./symbolMatch.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (event: MessageEvent<SymbolSearchResponse>) => {
    const message = event.data;
    if (message.type === "progress") callbacks.onProgress(message.fraction);
    else if (message.type === "result") callbacks.onResult(message.result);
    else callbacks.onError(message.message);
  };
  worker.onerror = () => callbacks.onError(SYMBOL_SEARCH_UNAVAILABLE);
  const init: SymbolSearchRequest = { type: "init", image };
  worker.postMessage(init, [image.data.buffer]);
  return {
    search: (box, orientations) => {
      const request: SymbolSearchRequest = { type: "search", box, orientations };
      worker.postMessage(request);
    },
    terminate: () => worker.terminate(),
  };
};
