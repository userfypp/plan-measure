import { recoverableLazy } from "./recoverableLazy";

/** The toolbar of a picked count item: loaded on demand and fetched when a plan opens. */
export const CountItemToolbar = recoverableLazy(() => import("./CountItemToolbar"), "Item");
