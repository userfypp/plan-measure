import { useAppState } from "../../app/state";
import type { PageState, Tool } from "../../types/domain";
import { formatNumber } from "../../utils/format";
import { fromMillimetres } from "../../utils/units";
import styles from "./ToolBar.module.css";

const TOOLS: { id: Tool; label: string; shortcut?: string }[] = [
  { id: "select", label: "Select" },
  { id: "hand", label: "Hand", shortcut: "Space" },
  { id: "calibrate", label: "Calibrate" },
  { id: "line", label: "Line" },
  { id: "polygon", label: "Polygon" },
];

interface ToolBarProps {
  page: PageState;
  onChooseTool: (tool: Tool) => void;
}

export function ToolBar({ page, onChooseTool }: ToolBarProps) {
  const { state } = useAppState();
  const calibrated = Boolean(page.calibration);
  const unit = state.session?.settings.displayUnit ?? "m";
  const reference = page.calibration
    ? `${formatNumber(fromMillimetres(page.calibration.referenceDistanceMm, unit))} ${unit} reference`
    : "Not calibrated";

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
                  ? `${tool.label} requires page calibration`
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
                    : tool.id === "calibrate"
                      ? "↔"
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
        <span>{reference}</span>
        {page.calibration && (
          <button type="button" onClick={() => onChooseTool("calibrate")}>
            Recalibrate
          </button>
        )}
      </div>
    </aside>
  );
}
