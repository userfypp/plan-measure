import type { GrayImage } from "../symbolCount/templateMatch";
import type { PlanDiffImage, PlanDiffPalette } from "./planDiff";

/** Messages between the page and `planDiff.worker.ts`. */
export type PlanDiffRequest =
  | { type: "init"; current: GrayImage; other: GrayImage }
  | { type: "diff"; dx: number; dy: number; palette: PlanDiffPalette };

export type PlanDiffResponse =
  { type: "result"; image: PlanDiffImage } | { type: "error"; message: string };

export interface PlanDiffCallbacks {
  onResult: (image: PlanDiffImage) => void;
  onError: (message: string) => void;
}

/** Two page renders kept in a worker, to compare them again after each change of alignment. */
export interface PlanDiff {
  diff: (dx: number, dy: number, palette: PlanDiffPalette) => void;
  terminate: () => void;
}

export type CreatePlanDiff = (
  current: GrayImage,
  other: GrayImage,
  callbacks: PlanDiffCallbacks,
) => PlanDiff;

export const PLAN_DIFF_UNAVAILABLE = "Comparing plans is not available here.";

/** Runs the comparison in a module worker; the renders move to it and stay there. */
export const createPlanDiff: CreatePlanDiff = (current, other, callbacks) => {
  const worker = new Worker(new URL("./planDiff.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (event: MessageEvent<PlanDiffResponse>) => {
    const message = event.data;
    if (message.type === "result") callbacks.onResult(message.image);
    else callbacks.onError(message.message);
  };
  worker.onerror = () => callbacks.onError(PLAN_DIFF_UNAVAILABLE);
  const init: PlanDiffRequest = { type: "init", current, other };
  worker.postMessage(init, [current.data.buffer, other.data.buffer]);
  return {
    diff: (dx, dy, palette) => {
      const request: PlanDiffRequest = { type: "diff", dx, dy, palette };
      worker.postMessage(request);
    },
    terminate: () => worker.terminate(),
  };
};
