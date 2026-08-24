import { useAppState } from "../../app/state";
import type { PageState, Tool } from "../../types/domain";
import { getActiveCalibration } from "../../utils/calibration";
import { formatDisplayNumber } from "../../utils/format";
import { fromMillimetres } from "../../utils/units";
import { calibrationScaleX, calibrationScaleY, isMeasurementType } from "../../utils/geometry";
import { viewerShortcuts } from "../../utils/keyboard";
import styles from "./ToolBar.module.css";

const TOOLS = viewerShortcuts.flatMap((shortcut) =>
  typeof shortcut.action === "string"
    ? []
    : [{ id: shortcut.action.tool, label: shortcut.label, shortcut: shortcut.key.toUpperCase() }],
);
const ORTHOGONAL_SHORTCUT = viewerShortcuts.find(
  (shortcut) => shortcut.action === "toggle-orthogonal",
)!;

interface ToolBarProps {
  page: PageState;
  onChooseTool: (tool: Tool) => void;
  onRestoreViewerFocus: () => void;
  onAddScale: () => void;
  onRecalibrate: () => void;
  onEditReferencePoints: () => void;
  editingCalibration: boolean;
  editingPageNumber: number | null;
  onCancelReferenceEdit: () => void;
}

export function ToolBar({
  page,
  onChooseTool,
  onRestoreViewerFocus,
  onAddScale,
  onRecalibrate,
  onEditReferencePoints,
  editingCalibration,
  editingPageNumber,
  onCancelReferenceEdit,
}: ToolBarProps) {
  const { state, dispatch } = useAppState();
  const activeCalibration = getActiveCalibration(page);
  const calibrated = Boolean(activeCalibration);
  const unit = state.session?.settings.displayUnit ?? "m";
  const reference = !activeCalibration
    ? "No active scale"
    : activeCalibration.mode === "uniform"
      ? `Uniform · ${formatDisplayNumber(fromMillimetres(activeCalibration.referenceDistanceMm, unit))} ${unit} reference`
      : `X/Y correction · X: ${formatDisplayNumber(calibrationScaleX(activeCalibration))} mm/unit · Y: ${formatDisplayNumber(calibrationScaleY(activeCalibration))} mm/unit`;

  return (
    <aside className={styles.toolbar} aria-label="Viewer tools">
      <div className={styles.tools}>
        {TOOLS.map((tool) => {
          const disabled = isMeasurementType(tool.id) && (!calibrated || editingCalibration);
          return (
            <button
              key={tool.id}
              type="button"
              className={state.tool === tool.id ? styles.active : ""}
              disabled={disabled}
              title={
                editingCalibration && isMeasurementType(tool.id)
                  ? "Finish or cancel the scale reference edit first"
                  : disabled
                  ? `${tool.label} requires an active scale`
                  : `${tool.label} (${tool.shortcut})`
              }
              onClick={() => {
                onChooseTool(tool.id);
                onRestoreViewerFocus();
              }}
            >
              <span className={styles.symbol} aria-hidden="true">
                {tool.id === "select"
                  ? "↖"
                  : tool.id === "hand"
                    ? "✋"
                    : tool.id === "line"
                      ? "╱"
                      : "△"}
              </span>
              <span>{tool.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          className={state.orthogonal ? styles.active : ""}
          aria-pressed={state.orthogonal}
          title={`Constrain new drawing segments to horizontal or vertical (${ORTHOGONAL_SHORTCUT.key.toUpperCase()})`}
          onClick={() => {
            dispatch({ type: "SET_ORTHOGONAL", value: !state.orthogonal });
            onRestoreViewerFocus();
          }}
        >
          <span className={styles.symbol} aria-hidden="true">
            ⊾
          </span>
          <span>{ORTHOGONAL_SHORTCUT.label}</span>
        </button>
      </div>
      <div className={styles.scale}>
        <strong>Scale</strong>
        {activeCalibration ? (
          <>
            <label className={styles.scaleSelect}>
              <span>Active</span>
              <select
                aria-label="Active scale for new measurements"
                value={activeCalibration.id}
                disabled={editingCalibration}
                onChange={(event) =>
                  dispatch({
                    type: "SET_ACTIVE_CALIBRATION",
                    pageNumber: page.pageNumber,
                    calibrationId: event.target.value,
                  })
                }
              >
                {page.calibrations.map((calibration) => (
                  <option key={calibration.id} value={calibration.id}>
                    {calibration.name}
                  </option>
                ))}
              </select>
            </label>
            <span>{reference}</span>
            <small>New measurements use this scale.</small>
          </>
        ) : (
          <span>{reference}</span>
        )}
        <div className={styles.scaleActions}>
          <button
            type="button"
            className={state.tool === "calibrate" ? styles.activeScaleAction : ""}
            disabled={editingCalibration}
            onClick={onAddScale}
          >
            Add scale
          </button>
          {activeCalibration && (
            <button type="button" disabled={editingCalibration} onClick={onRecalibrate}>
              Recalibrate
            </button>
          )}
          {page.calibrations.length > 0 && (
            <button type="button" disabled={editingCalibration} onClick={onEditReferencePoints}>
              Edit reference points
            </button>
          )}
        </div>
        {editingCalibration && (
          <div>
            <small>
              Editing scale reference{editingPageNumber === page.pageNumber ? " on this page" : ` on page ${editingPageNumber}`}.
            </small>
            <button type="button" onClick={onCancelReferenceEdit}>
              Cancel edit
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
