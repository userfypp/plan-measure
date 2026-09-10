import { memo } from "react";
import { IconButton } from "../../components/ui";
import { ToolIcon } from "../viewer/ToolIcon";
import type { MeasurementViewModel } from "./measurementViewModels";
import styles from "./MeasurementRow.module.css";

function VisibilityIcon({ visible }: { visible: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path
        d="M2.5 12s3.25-5.25 9.5-5.25S21.5 12 21.5 12 18.25 17.25 12 17.25 2.5 12 2.5 12Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.5" />
      {!visible && <path d="m4 4 16 16" strokeLinecap="round" />}
    </svg>
  );
}

export interface MeasurementRowProps {
  viewModel: MeasurementViewModel & { selected: boolean };
  onSelectMeasurement: (measurementId: string) => void;
  onToggleVisibility: (measurementId: string, visible: boolean) => void;
  selectionTabIndex?: number;
  visibilityTabIndex?: number;
}

export const MeasurementRow = memo(function MeasurementRow({
  viewModel,
  onSelectMeasurement,
  onToggleVisibility,
  selectionTabIndex = 0,
  visibilityTabIndex = 0,
}: MeasurementRowProps) {
  const detailsId = `measurement-details-${viewModel.id}`;
  const quantityLines =
    viewModel.type === "polygon" ? viewModel.valueLabel.split(" · ") : [viewModel.valueLabel];

  return (
    <article
      className={[styles.row, viewModel.selected ? styles.selected : ""].filter(Boolean).join(" ")}
      role="listitem"
    >
      <span className={styles.selectionMarker} aria-hidden="true" />
      <button
        type="button"
        className={styles.selection}
        data-measurement-id={viewModel.id}
        data-measurement-control="selection"
        tabIndex={selectionTabIndex}
        aria-label={`${viewModel.selected ? "Selected" : "Select"} measurement ${viewModel.name}`}
        aria-pressed={viewModel.selected}
        aria-describedby={detailsId}
        onClick={() => onSelectMeasurement(viewModel.id)}
      >
        <span className={styles.glyph} aria-hidden="true">
          <ToolIcon name={viewModel.type} />
        </span>
        <span className={styles.summary} id={detailsId}>
          <span className={styles.name}>{viewModel.name}</span>
          <span className={[styles.value, quantityLines.length > 1 ? styles.valueStack : ""].filter(Boolean).join(" ")}>
            {quantityLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </span>
          <span
            className={[styles.metadata, !viewModel.hasCalibration ? styles.unavailable : ""]
              .filter(Boolean)
              .join(" ")}
          >
            {viewModel.typeLabel} · {viewModel.calibrationSummary.split(" · ")[0]}
          </span>
        </span>
      </button>
      <div className={styles.actions}>
        <IconButton
          icon={<VisibilityIcon visible={viewModel.visible} />}
          className={styles.visibilityButton}
          data-measurement-id={viewModel.id}
          data-measurement-control="visibility"
          tabIndex={visibilityTabIndex}
          aria-label={`${viewModel.visible ? "Hide" : "Show"} measurement ${viewModel.name}`}
          tooltip={`${viewModel.visible ? "Hide" : "Show"} measurement`}
          pressed={viewModel.visible}
          onClick={() => onToggleVisibility(viewModel.id, !viewModel.visible)}
        />
      </div>
    </article>
  );
});
