import type { ClassificationCatalog } from "../../types/domain";
import { ClassificationManager } from "./ClassificationManager";
import styles from "./ClassificationWorkspace.module.css";

export interface ClassificationWorkspaceProps {
  catalog: ClassificationCatalog;
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
