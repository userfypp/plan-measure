import { useAppState } from "../../app/state";
import type { PageState, Tool } from "../../types/domain";
import { getActiveCalibration } from "../../utils/calibration";
import { formatNumber } from "../../utils/format";
import { fromMillimetres } from "../../utils/units";
import styles from "./ToolBar.module.css";

const TOOLS: { id: Exclude<Tool, "calibrate">; label: string; shortcut?: string }[] = [
  { id: "select", label: "Select" },
  { id: "hand", label: "Hand", shortcut: "Space" },
  { id: "line", label: "Line" },
  { id: "polygon", label: "Polygon" },
];

interface ToolBarProps {
  page: PageState;
  onChooseTool: (tool: Tool) => void;
  onAddScale: () => void;
  onRecalibrate: () => void;
}

export function ToolBar({ page, onChooseTool, onAddScale, onRecalibrate }: ToolBarProps) {
  const { state, dispatch } = useAppState();
  const activeCalibration = getActiveCalibration(page);
  const calibrated = Boolean(activeCalibration);
  const unit = state.session?.settings.displayUnit ?? "m";
  const reference = activeCalibration
    ? `${formatNumber(fromMillimetres(activeCalibration.referenceDistanceMm, unit))} ${unit} reference`
    : "No active scale";

  return (
    <aside className={styles.toolbar} aria-label="Viewer tools">
      <div className={styles.tools}>
        {TOOLS.map((tool) => {
          const disabled = (tool.id === "line" || tool.id === "polygon") && !calibrated;
          return (
            <button
              key={tool.id}
              type="button"
              className={state.tool === tool.id ? styles.active : ""}
              disabled={disabled}
              title={
                disabled
                  ? `${tool.label} requires an active scale`
                  : tool.shortcut
                    ? `${tool.label} (${tool.shortcut})`
                    : tool.label
              }
              onClick={() => onChooseTool(tool.id)}
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
            onClick={onAddScale}
          >
            Add scale
          </button>
          {activeCalibration && (
            <button type="button" onClick={onRecalibrate}>
              Recalibrate
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
