import { recoverableLazy } from "../../app/recoverableLazy";

/** The controls of "Compare with another PDF"; loading them also registers the overlay. */
export const PlanCompareBar = recoverableLazy(() => import("./PlanCompareBar"), "Compare plans");
