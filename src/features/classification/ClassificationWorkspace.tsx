import { useState } from "react";
import { Button } from "../../components/ui";
import { ClassificationTemplateLibrary } from "./ClassificationTemplateLibrary";
import type { ClassificationTemplateDimension } from "./classificationTemplates";
import type { ClassificationCatalog } from "../../types/domain";
import { ClassificationManager } from "./ClassificationManager";
import styles from "./ClassificationWorkspace.module.css";

export interface ClassificationWorkspaceProps {
  catalog: ClassificationCatalog;
  onCreateDimension: (name: string) => void;
  onRenameDimension: (dimensionId: string, name: string) => void;
  onDeleteDimension: (dimensionId: string) => void;
  onArchiveDimension: (dimensionId: string) => void;
  onRestoreDimension: (dimensionId: string) => void;
  onCreateValue: (dimensionId: string, name: string) => void;
  onRenameValue: (dimensionId: string, valueId: string, name: string) => void;
  onDeleteValue: (dimensionId: string, valueId: string) => void;
  onArchiveValue: (dimensionId: string, valueId: string) => void;
  onRestoreValue: (dimensionId: string, valueId: string) => void;
  onApplyTemplate?: (dimensions: ClassificationTemplateDimension[]) => boolean;
  disabled?: boolean;
}

export function ClassificationWorkspace({
  catalog,
  onCreateDimension,
  onRenameDimension,
  onDeleteDimension,
  onArchiveDimension,
  onRestoreDimension,
  onCreateValue,
  onRenameValue,
  onDeleteValue,
  onArchiveValue,
  onRestoreValue,
  onApplyTemplate,
  disabled = false,
}: ClassificationWorkspaceProps) {
  const [showTemplates, setShowTemplates] = useState(false);
  return (
    <div className={styles.workspace}>
      {onApplyTemplate && (
        <header className={styles.header}>
          <h2>{showTemplates ? "Templates" : "Project catalog"}</h2>
          <Button size="compact" variant="ghost" onClick={() => setShowTemplates(!showTemplates)}>
            {showTemplates ? "Back to project" : "Templates"}
          </Button>
        </header>
      )}
      {showTemplates && onApplyTemplate ? (
        <ClassificationTemplateLibrary catalog={catalog} disabled={disabled} onApply={onApplyTemplate} />
      ) : (
        <ClassificationManager
          catalog={catalog}
          onCreateDimension={onCreateDimension}
          onRenameDimension={onRenameDimension}
          onDeleteDimension={onDeleteDimension}
          onArchiveDimension={onArchiveDimension}
          onRestoreDimension={onRestoreDimension}
          onCreateValue={onCreateValue}
          onRenameValue={onRenameValue}
          onDeleteValue={onDeleteValue}
          onArchiveValue={onArchiveValue}
          onRestoreValue={onRestoreValue}
          disabled={disabled}
        />
      )}
    </div>
  );
}
