import { ToolbarComposite } from "../../app/ContextToolbar";
import toolbarStyles from "../../app/ContextToolbar.module.css";
import { Button, Select, Switch } from "../../components/ui";
import {
  SIMILARITY_PRESETS,
  acceptedPoints,
  stopSymbolCount,
  symbolCountSession,
  useSymbolCountState,
  type SymbolCountSession,
} from "./symbolCountSession";
import { SymbolCountOverlay } from "./SymbolCountOverlay";
import { setSymbolCount } from "./symbolCountStore";
import styles from "./SymbolCountBar.module.css";

setSymbolCount({ overlay: SymbolCountOverlay });

const SIMILARITY_OPTIONS = SIMILARITY_PRESETS.map(({ value, label }) => ({ value, label }));

export const PICK_PROMPT = "Drag a box around one symbol";

export interface SymbolCountBarProps {
  session?: SymbolCountSession;
}

/** Controls of "Find similar symbols", shown in place of the Count tool's own controls. */
export function SymbolCountBar({ session = symbolCountSession }: SymbolCountBarProps) {
  const state = useSymbolCountState(session);
  const count = state.phase === "review" ? acceptedPoints(state).length : 0;
  const status =
    state.phase === "scanning"
      ? `Searching the page… ${state.progress}%`
      : state.phase === "review"
        ? `${count} ${count === 1 ? "match" : "matches"}`
        : (state.message ?? PICK_PROMPT);

  return (
    <ToolbarComposite
      label="Find similar symbols controls"
      contextKind="drawing"
      drawingTool="count"
    >
      <span className={`${toolbarStyles.toolIdentity} ${styles.fixed}`} role="status">
        {status}
      </span>
      <span className={toolbarStyles.divider} aria-hidden="true" />
      {state.phase === "review" && (
        <>
          <Select
            className={styles.similarity}
            label="Similarity"
            value={state.similarity}
            options={SIMILARITY_OPTIONS}
            onChange={session.setSimilarity}
          />
          <span className={styles.option}>
            <span className={styles.optionLabel} aria-hidden="true">
              Any orientation
            </span>
            <Switch
              aria-label="Any orientation"
              checked={state.orientations}
              onChange={session.setOrientations}
            />
          </span>
          <Button
            className={styles.fixed}
            variant="primary"
            size="compact"
            disabled={count === 0}
            onClick={() => session.commit()}
          >
            {`Add ${count} ${count === 1 ? "item" : "items"}`}
          </Button>
        </>
      )}
      <Button
        className={styles.fixed}
        variant="ghost"
        size="compact"
        autoFocus
        onClick={stopSymbolCount}
      >
        Cancel
      </Button>
    </ToolbarComposite>
  );
}

export default SymbolCountBar;
