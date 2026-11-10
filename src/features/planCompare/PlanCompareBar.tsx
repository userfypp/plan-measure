import { useEffect, useMemo } from "react";
import { ToolbarComposite } from "../../app/ContextToolbar";
import toolbarStyles from "../../app/ContextToolbar.module.css";
import { Button, Select } from "../../components/ui";
import { isBlockingOverlayOpen } from "../../utils/shortcuts/dispatcher";
import { PlanCompareOverlay } from "./PlanCompareOverlay";
import {
  planCompareSession,
  usePlanCompareState,
  type PlanCompareSession,
} from "./planCompareSession";
import { setPlanCompare, stopPlanCompare, usePlanCompare } from "./planCompareStore";
import styles from "./PlanCompareBar.module.css";

export const ALIGN_OTHER_PROMPT = "Click a reference point on the other version";
export const ALIGN_CURRENT_PROMPT = "Click the same point on this version";

export interface PlanCompareBarProps {
  session?: PlanCompareSession;
}

/** Controls of "Compare with another PDF", shown in place of the contextual toolbar. */
export function PlanCompareBar({ session = planCompareSession }: PlanCompareBarProps) {
  const { file } = usePlanCompare();
  const state = usePlanCompareState(session);
  const pageOptions = useMemo(
    () =>
      Array.from({ length: state.pageCount }, (_, index) => ({
        value: String(index + 1),
        label: `Page ${index + 1}`,
      })),
    [state.pageCount],
  );

  useEffect(() => {
    setPlanCompare({ overlay: PlanCompareOverlay });
    return () => setPlanCompare({ overlay: undefined });
  }, []);

  useEffect(() => {
    if (file) void session.open(file);
    return () => session.close();
  }, [file, session]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isBlockingOverlayOpen()) return;
      if (event.target instanceof Element && event.target.closest('[role="menu"]')) return;
      event.preventDefault();
      event.stopPropagation();
      if (session.getState().align !== "off") session.cancelAlign();
      else stopPlanCompare();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [session]);

  const status =
    state.phase === "error"
      ? (state.message ?? "The plans could not be compared.")
      : state.align === "other"
        ? ALIGN_OTHER_PROMPT
        : state.align === "current"
          ? ALIGN_CURRENT_PROMPT
          : state.phase === "ready"
            ? `Comparing with ${state.fileName}`
            : "Loading…";
  const ready = state.phase === "ready";
  const moved = state.offset.x !== 0 || state.offset.y !== 0;

  return (
    <ToolbarComposite label="Compare plans controls" contextKind="compare">
      <span className={`${toolbarStyles.toolIdentity} ${styles.fixed}`} role="status">
        {status}
      </span>
      <span className={toolbarStyles.divider} aria-hidden="true" />
      {state.pageCount > 0 && state.phase !== "error" && (
        <Select
          className={styles.page}
          label="Page of the other PDF"
          value={String(state.otherPage)}
          options={pageOptions}
          onChange={(value) => session.selectPage(Number(value))}
        />
      )}
      {ready && (
        <>
          <Button
            className={styles.fixed}
            variant="secondary"
            size="compact"
            disabled={state.align !== "off"}
            onClick={session.beginAlign}
          >
            Align
          </Button>
          {moved && (
            <Button
              className={styles.fixed}
              variant="ghost"
              size="compact"
              onClick={session.resetAlignment}
            >
              Reset alignment
            </Button>
          )}
          <span className={styles.legend}>
            <span className={styles.key}>
              <span className={`${styles.swatch} ${styles.removed}`} aria-hidden="true" />
              Removed
            </span>
            <span className={styles.key}>
              <span className={`${styles.swatch} ${styles.added}`} aria-hidden="true" />
              Added
            </span>
          </span>
        </>
      )}
      <Button
        className={styles.fixed}
        variant="ghost"
        size="compact"
        autoFocus
        onClick={stopPlanCompare}
      >
        Close
      </Button>
    </ToolbarComposite>
  );
}

export default PlanCompareBar;
