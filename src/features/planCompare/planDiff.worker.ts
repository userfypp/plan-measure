import type { GrayImage } from "../symbolCount/templateMatch";
import { diffPlans } from "./planDiff";
import type { PlanDiffRequest, PlanDiffResponse } from "./planDiffWorkerClient";

let images: { current: GrayImage; other: GrayImage } | null = null;

function reply(message: PlanDiffResponse, transfer: Transferable[] = []) {
  postMessage(message, { transfer });
}

addEventListener("message", (event: MessageEvent<PlanDiffRequest>) => {
  const request = event.data;
  if (request.type === "init") {
    images = { current: request.current, other: request.other };
    return;
  }
  if (!images) {
    reply({ type: "error", message: "The pages were not loaded for the comparison." });
    return;
  }
  try {
    const image = diffPlans(images.current, images.other, request.dx, request.dy, request.palette);
    reply({ type: "result", image }, [image.rgba.buffer]);
  } catch {
    reply({ type: "error", message: "The comparison could not finish." });
  }
});
