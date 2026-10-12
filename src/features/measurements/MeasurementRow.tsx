import { memo, type RefCallback } from "react";
import { IconButton } from "../../components/ui";
import { measurementPathSpecs } from "../../utils/geometry";
import { ToolIcon } from "../viewer/ToolIcon";
import type { MeasurementViewModel } from "./measurementViewModels";
import styles from "./MeasurementRow.module.css";

function VisibilityIcon({ visible }: { visible: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path
        d="M2.08 10s2.71 -4.38 7.92 -4.38S17.92 10 17.92 10 15.21 14.38 10 14.38 2.08 10 2.08 10Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2.08" />
      {!visible && <path d="m3.33 3.33 13.33 13.33" strokeLinecap="round" />}
    </svg>
  );
}

export interface MeasurementRowProps {
  viewModel: MeasurementViewModel & { selected: boolean };
  onSelectMeasurement: (measurementId: string, additive?: boolean) => void;
  onToggleVisibility: (measurementId: string, visible: boolean) => void;
  selectionTabIndex?: number;
  visibilityTabIndex?: number;
  positionInSet?: number;
  setSize?: number;
  rowRef?: RefCallback<HTMLElement>;
  virtualKey?: string;
}

export const MeasurementRow = memo(function MeasurementRow({
  viewModel,
  onSelectMeasurement,
  onToggleVisibility,
  selectionTabIndex = 0,
  visibilityTabIndex = 0,
  positionInSet,
  setSize,
  rowRef,
  virtualKey,
}: MeasurementRowProps) {
  const detailsId = `measurement-details-${viewModel.id}`;
  const quantityLines =
    measurementPathSpecs[viewModel.type].closed ? viewModel.valueLabel.split(" · ") : [viewModel.valueLabel];
  const scaleSummary = viewModel.type === "count" ? "" : ` · ${viewModel.calibrationSummary.split(" · ")[0]}`;
  const metadata = `${viewModel.typeLabel}${scaleSummary}${
    viewModel.pageLabel ? ` · ${viewModel.pageLabel}` : ""
  }`;

  return (
    <article
      ref={rowRef}
      data-virtual-key={virtualKey}
      aria-posinset={positionInSet}
      aria-setsize={setSize}
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
        title={metadata}
        onClick={(event) => onSelectMeasurement(viewModel.id, event.shiftKey || event.ctrlKey || event.metaKey)}
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
            className={[styles.metadata, viewModel.type !== "count" && !viewModel.hasCalibration ? styles.unavailable : ""]
              .filter(Boolean)
              .join(" ")}
          >
            {metadata}
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
          pressed={viewModel.visible}
          onClick={() => onToggleVisibility(viewModel.id, !viewModel.visible)}
        />
      </div>
    </article>
  );
});
