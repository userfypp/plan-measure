import { memo, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from "react";
import { Button, IconButton, Input } from "../../components/ui";
import type { MeasurementViewModel } from "./measurementViewModels";
import styles from "./MeasurementRow.module.css";

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 7h14" strokeLinecap="round" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="m7 7 .75 12.25A1.8 1.8 0 0 0 9.55 21h4.9a1.8 1.8 0 0 0 1.8-1.75L17 7" />
      <path d="M10 11v6M14 11v6" strokeLinecap="round" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m4 16.5-.75 3.25L6.5 19 18.7 6.8a2.3 2.3 0 0 0-3.25-3.25L3.05 15.75" />
      <path d="m13.75 5.25 3.25 3.25" strokeLinecap="round" />
    </svg>
  );
}

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
  onRenameMeasurement: (measurementId: string, name: string) => void;
  onToggleVisibility: (measurementId: string, visible: boolean) => void;
  onDeleteMeasurement: (measurementId: string) => void;
}

export const MeasurementRow = memo(function MeasurementRow({
  viewModel,
  onSelectMeasurement,
  onRenameMeasurement,
  onToggleVisibility,
  onDeleteMeasurement,
}: MeasurementRowProps) {
  const detailsId = `measurement-details-${viewModel.id}`;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(viewModel.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const selectionButtonRef = useRef<HTMLButtonElement>(null);

  function beginRename(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setName(viewModel.name);
    setNameError(null);
    setEditing(true);
  }

  function cancelRename() {
    setName(viewModel.name);
    setNameError(null);
    setEditing(false);
    window.requestAnimationFrame(() => selectionButtonRef.current?.focus());
  }

  function handleNameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    cancelRename();
  }

  function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Measurement name cannot be empty.");
      return;
    }
    onRenameMeasurement(viewModel.id, trimmed);
    setName(trimmed);
    setNameError(null);
    setEditing(false);
    window.requestAnimationFrame(() => selectionButtonRef.current?.focus());
  }

  return (
    <article
      className={[styles.row, viewModel.selected ? styles.selected : ""].filter(Boolean).join(" ")}
      data-editing={editing || undefined}
      role="listitem"
    >
      <div className={styles.content}>
        {editing ? (
          <form className={styles.renameForm} onSubmit={submitRename}>
            <Input
              className={styles.renameInput}
              aria-label={`Name for ${viewModel.name}`}
              value={name}
              error={nameError}
              autoFocus
              onChange={(event) => setName(event.target.value)}
              onKeyDown={handleNameKeyDown}
            />
            <div className={styles.editActions}>
              <Button variant="secondary" size="compact" onClick={cancelRename}>
                Cancel
              </Button>
              <Button type="submit" size="compact">
                Save
              </Button>
            </div>
          </form>
        ) : (
          <button
            ref={selectionButtonRef}
            type="button"
            className={styles.selection}
            aria-label={`${viewModel.selected ? "Selected" : "Select"} measurement ${viewModel.name}`}
            aria-pressed={viewModel.selected}
            aria-describedby={detailsId}
            onClick={() => onSelectMeasurement(viewModel.id)}
          >
            <span className={styles.summary} id={detailsId}>
              <span className={styles.nameLine}>
                <span className={styles.name}>{viewModel.name}</span>
                <span className={styles.type}>{viewModel.typeLabel}</span>
              </span>
              <span className={styles.value}>{viewModel.valueLabel}</span>
              <span
                className={[styles.calibration, !viewModel.hasCalibration ? styles.unavailable : ""]
                  .filter(Boolean)
                  .join(" ")}
              >
                {viewModel.calibrationSummary}
              </span>
            </span>
          </button>
        )}
      </div>
      <div className={styles.actions}>
        {!editing && (
          <IconButton
            icon={<VisibilityIcon visible={viewModel.visible} />}
            aria-label={`${viewModel.visible ? "Hide" : "Show"} measurement ${viewModel.name}`}
            tooltip={`${viewModel.visible ? "Hide" : "Show"} measurement`}
            pressed={viewModel.visible}
            onClick={() => onToggleVisibility(viewModel.id, !viewModel.visible)}
          />
        )}
        {!editing && (
          <IconButton
            className={styles.rename}
            icon={<PencilIcon />}
            aria-label={`Rename ${viewModel.name}`}
            tooltip="Rename measurement"
            onClick={beginRename}
          />
        )}
        {!editing && (
          <IconButton
            icon={<TrashIcon />}
            aria-label={`Delete ${viewModel.name}`}
            tooltip="Delete measurement"
            tone="danger"
            onClick={() => onDeleteMeasurement(viewModel.id)}
          />
        )}
      </div>
    </article>
  );
});
