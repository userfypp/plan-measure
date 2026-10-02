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
  onArchiveDimension: (dimensionId: string) => void;
  onRestoreDimension: (dimensionId: string) => void;
  onCreateValue: (dimensionId: string, name: string) => void;
  onRenameValue: (dimensionId: string, valueId: string, name: string) => void;
  onArchiveValue: (dimensionId: string, valueId: string) => void;
  onRestoreValue: (dimensionId: string, valueId: string) => void;
  onApplyTemplate?: (dimensions: ClassificationTemplateDimension[]) => boolean;
  disabled?: boolean;
}

export function ClassificationWorkspace({
  catalog,
  onCreateDimension,
  onRenameDimension,
  onArchiveDimension,
  onRestoreDimension,
  onCreateValue,
  onRenameValue,
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
          onArchiveDimension={onArchiveDimension}
          onRestoreDimension={onRestoreDimension}
          onCreateValue={onCreateValue}
          onRenameValue={onRenameValue}
          onArchiveValue={onArchiveValue}
          onRestoreValue={onRestoreValue}
          disabled={disabled}
        />
      )}
    </div>
  );
}
