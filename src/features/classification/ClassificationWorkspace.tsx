import { useEffect, useRef, useState } from "react";
import { ArrowLeftIcon, IconButton, TemplatesIcon } from "../../components/ui";
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
  const headerRef = useRef<HTMLElement>(null);
  const toggledRef = useRef(false);
  // The pressed button unmounts as the view flips: hand the focus to its counterpart.
  useEffect(() => {
    if (!toggledRef.current) return;
    toggledRef.current = false;
    headerRef.current?.querySelector("button")?.focus();
  }, [showTemplates]);
  const toggleTemplates = (next: boolean) => {
    toggledRef.current = true;
    setShowTemplates(next);
  };
  return (
    <div className={styles.workspace}>
      {onApplyTemplate && (
        <header ref={headerRef} className={styles.header}>
          {showTemplates && (
            <IconButton
              icon={<ArrowLeftIcon />}
              aria-label="Back to project"
              tooltip="Back to project"
              onClick={() => toggleTemplates(false)}
            />
          )}
          <h2>{showTemplates ? "Templates" : "Project catalog"}</h2>
          {!showTemplates && (
            <IconButton
              icon={<TemplatesIcon />}
              aria-label="Templates"
              tooltip="Templates"
              onClick={() => toggleTemplates(true)}
            />
          )}
        </header>
      )}
      {showTemplates && onApplyTemplate ? (
        <ClassificationTemplateLibrary
          catalog={catalog}
          disabled={disabled}
          onApply={onApplyTemplate}
        />
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
