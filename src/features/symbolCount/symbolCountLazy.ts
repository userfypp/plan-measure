import { recoverableLazy } from "../../app/recoverableLazy";

/** The controls of "Find similar symbols"; loading them also registers the overlay. */
export const SymbolCountBar = recoverableLazy(() => import("./SymbolCountBar"), "Find similar");
