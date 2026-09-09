import { useState, type FormEvent } from "react";
import { Button, Input } from "../../components/ui";
import type { ClassificationCatalog, LinearUnit, Measurement, PageState } from "../../types/domain";
import { getMeasurementCalibration } from "../../utils/calibration";
import { ClassificationAssignment } from "../classification/ClassificationAssignment";
import { scaleDisplayMetadata } from "../viewer/scaleDisplay";
import { createMeasurementViewModel } from "./measurementViewModels";
import type { WorkspaceModule } from "../../app/workspaceState";
import { workspaceModuleLabel } from "../../app/WorkspacePanel";
import styles from "./MeasurementDetails.module.css";

export interface MeasurementDetailsProps {
  page: PageState;
  measurement: Measurement;
  displayUnit: LinearUnit;
  catalog: ClassificationCatalog;
  returnModule: WorkspaceModule;
  assignmentDisabled?: boolean;
  onBack: () => void;
  onRename: (name: string) => void;
  onAssignClassification: (measurementId: string, dimensionId: string, valueId: string | null) => void;
  onEditGeometry: () => void;
  onDelete: () => void;
}

export function MeasurementDetails({
  page,
  measurement,
  displayUnit,
  catalog,
  returnModule,
  assignmentDisabled = false,
  onBack,
  onRename,
  onAssignClassification,
  onEditGeometry,
  onDelete,
}: MeasurementDetailsProps) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(measurement.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const viewModel = createMeasurementViewModel(page, measurement, displayUnit, true);
  const calibration = getMeasurementCalibration(page, measurement);
  const scaleMetadata = calibration ? scaleDisplayMetadata(calibration) : null;

  function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Measurement name cannot be empty.");
      return;
    }
    onRename(trimmed);
    setName(trimmed);
    setNameError(null);
    setRenaming(false);
  }

  return (
    <section className={styles.details} aria-label={`Details for ${measurement.name}`}>
      <div className={styles.scrollArea}>
        <Button variant="ghost" size="compact" className={styles.back} onClick={onBack}>
          ‹ Back to {workspaceModuleLabel(returnModule).toLowerCase()}
        </Button>

        <div className={styles.summary}>
          <span className={styles.selectionMarker} aria-hidden="true" />
          <strong>{measurement.name}</strong>
          <span className={styles.result}>{viewModel.valueLabel}</span>
        </div>

        <section className={styles.section} aria-label="Measurement properties">
          <h3>Measurement</h3>
          {renaming ? (
            <form className={styles.renameForm} onSubmit={submitRename}>
              <Input
                label="Name"
                value={name}
                error={nameError}
                autoFocus
                onChange={(event) => {
                  setName(event.target.value);
                  setNameError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  setName(measurement.name);
                  setNameError(null);
                  setRenaming(false);
                }}
              />
              <div className={styles.renameActions}>
                <Button
                  variant="secondary"
                  size="compact"
                  onClick={() => {
                    setName(measurement.name);
                    setNameError(null);
                    setRenaming(false);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" size="compact">Save</Button>
              </div>
            </form>
          ) : (
            <div className={styles.propertyRow}>
              <span>Name</span>
              <div className={styles.propertyActionValue}>
                <strong>{measurement.name}</strong>
                <Button
                  variant="ghost"
                  size="compact"
                  aria-label={`Rename ${measurement.name}`}
                  onClick={() => {
                    setName(measurement.name);
                    setNameError(null);
                    setRenaming(true);
                  }}
                >
                  Rename
                </Button>
              </div>
            </div>
          )}
          <div className={styles.propertyRow}>
            <span>Type</span>
            <strong>{viewModel.typeLabel}</strong>
          </div>
          <div className={styles.propertyRow}>
            <span>Scale</span>
            <strong>
              {calibration && scaleMetadata
                ? `${calibration.name} · ${scaleMetadata.ratioLabel}`
                : "Scale unavailable"}
            </strong>
          </div>
          <div className={styles.propertyRow}>
            <span>Mode</span>
            <strong>{scaleMetadata?.modeLabel ?? "Unavailable"}</strong>
          </div>
          <div className={styles.propertyRow}>
            <span>Page</span>
            <strong>{page.pageNumber}</strong>
          </div>
        </section>

        <section className={styles.section} aria-label="Measurement organization">
          <h3>Organization</h3>
          <ClassificationAssignment
            measurementId={measurement.id}
            appliedValueIds={measurement.classificationValueIds}
            catalog={catalog}
            onAssign={onAssignClassification}
            disabled={assignmentDisabled}
            compact
          />
        </section>

        <Button variant="secondary" size="compact" onClick={onEditGeometry}>
          Edit geometry
        </Button>
      </div>

      <div className={styles.dangerZone}>
        <Button
          variant="ghost"
          size="compact"
          className={styles.deleteAction}
          onClick={onDelete}
        >
          Delete measurement
        </Button>
      </div>
    </section>
  );
}
