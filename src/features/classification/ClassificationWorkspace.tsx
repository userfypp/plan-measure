import type { ClassificationCatalog } from "../../types/domain";
import { ClassificationAssignment } from "./ClassificationAssignment";
import { ClassificationManager } from "./ClassificationManager";
import styles from "./ClassificationWorkspace.module.css";

interface SelectedMeasurement {
  id: string;
  name: string;
  classificationValueIds: readonly string[];
}

export interface ClassificationWorkspaceProps {
  catalog: ClassificationCatalog;
  selectedMeasurement: SelectedMeasurement | null;
  onAssign: (measurementId: string, dimensionId: string, valueId: string | null) => void;
  onCreateDimension: (name: string) => void;
  onRenameDimension: (dimensionId: string, name: string) => void;
  onCreateValue: (dimensionId: string, name: string) => void;
  onRenameValue: (dimensionId: string, valueId: string, name: string) => void;
  onArchiveValue: (dimensionId: string, valueId: string) => void;
  onRestoreValue: (dimensionId: string, valueId: string) => void;
  disabled?: boolean;
}

export function ClassificationWorkspace({
  catalog,
  selectedMeasurement,
  onAssign,
  onCreateDimension,
  onRenameDimension,
  onCreateValue,
  onRenameValue,
  onArchiveValue,
  onRestoreValue,
  disabled = false,
}: ClassificationWorkspaceProps) {
  return (
    <div className={styles.workspace}>
      <section
        key={selectedMeasurement?.id ?? "no-selection"}
        className={styles.assignmentRegion}
        aria-label="Selected measurement classifications"
      >
        <header className={styles.assignmentHeader}>
          <span className={styles.eyebrow}>Selected measurement</span>
          <strong>{selectedMeasurement?.name ?? "None selected"}</strong>
        </header>
        {selectedMeasurement ? (
          <ClassificationAssignment
            measurementId={selectedMeasurement.id}
            appliedValueIds={selectedMeasurement.classificationValueIds}
            catalog={catalog}
            onAssign={onAssign}
            disabled={disabled}
            compact
          />
        ) : (
          <p className={styles.empty}>Select a measurement on the plan or in the Measurements tab to assign values.</p>
        )}
      </section>
      <ClassificationManager
        catalog={catalog}
        onCreateDimension={onCreateDimension}
        onRenameDimension={onRenameDimension}
        onCreateValue={onCreateValue}
        onRenameValue={onRenameValue}
        onArchiveValue={onArchiveValue}
        onRestoreValue={onRestoreValue}
        disabled={disabled}
      />
    </div>
  );
}
