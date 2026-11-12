import { recoverableLazy } from "../../app/recoverableLazy";

/** The optional diagnostics (Settings → Performance): their code is fetched only when they are shown. */
export const DebugOverlay = recoverableLazy(() => import("./DebugOverlay"), "Diagnostics");
