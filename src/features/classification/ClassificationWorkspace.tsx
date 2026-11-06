import { useEffect, useRef, useState } from "react";
import { ArrowLeftIcon, IconButton, Input, SearchIcon, TemplatesIcon } from "../../components/ui";
import { ClassificationTemplateLibrary } from "./ClassificationTemplateLibrary";
import type { ClassificationTemplate, TemplateConflictPolicy } from "./classificationTemplates";
import type {
  ClassificationCatalog,
  ClassificationValueDerivation,
  ClassificationValuePrice,
  ClassificationValueRates,
  MeasurementDecimalPlaces,
  MeasurementDisplayUnit,
} from "../../types/domain";
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
  rates?: ClassificationValueRates[];
  currency?: string | null;
  displayUnit?: MeasurementDisplayUnit;
  decimalPlaces?: MeasurementDecimalPlaces;
  onSetValueRates?: (
    valueId: string,
    derivation: ClassificationValueDerivation | null,
    price: ClassificationValuePrice | null,
    currency: string | null,
  ) => boolean;
  onApplyTemplate?: (template: ClassificationTemplate, policy: TemplateConflictPolicy) => boolean;
  disabled?: boolean;
}

const NO_RATES: ClassificationValueRates[] = [];

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
  rates = NO_RATES,
  currency = null,
  displayUnit,
  decimalPlaces,
  onSetValueRates,
  onApplyTemplate,
  disabled = false,
}: ClassificationWorkspaceProps) {
  const [showTemplates, setShowTemplates] = useState(false);
  // The two views search different things, so the query starts over with each.
  const [search, setSearch] = useState("");
  const headerRef = useRef<HTMLElement>(null);
  const toggledRef = useRef(false);
  // The pressed button unmounts as the view flips: hand the focus to its counterpart.
  useEffect(() => {
    if (!toggledRef.current) return;
    toggledRef.current = false;
    headerRef.current?.querySelector<HTMLElement>("[data-view-toggle]")?.focus();
  }, [showTemplates]);
  const toggleTemplates = (next: boolean) => {
    toggledRef.current = true;
    setSearch("");
    setShowTemplates(next);
  };
  return (
    <div className={styles.workspace}>
      <header ref={headerRef} className={styles.header}>
        <div className={styles.headerSearch}>
          <Input
            type="search"
            aria-label="Search classifications"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onClear={() => setSearch("")}
            leading={<SearchIcon />}
            placeholder="Search classifications"
          />
        </div>
        {onApplyTemplate &&
          (showTemplates ? (
            <IconButton
              key="back"
              data-view-toggle=""
              icon={<ArrowLeftIcon />}
              aria-label="Back to project"
              tooltip="Back to project"
              onClick={() => toggleTemplates(false)}
            />
          ) : (
            <IconButton
              key="templates"
              data-view-toggle=""
              icon={<TemplatesIcon />}
              aria-label="Templates"
              tooltip="Templates"
              onClick={() => toggleTemplates(true)}
            />
          ))}
      </header>
      {showTemplates && onApplyTemplate ? (
        <ClassificationTemplateLibrary
          catalog={catalog}
          rates={rates}
          currency={currency}
          disabled={disabled}
          search={search}
          onApply={onApplyTemplate}
        />
      ) : (
        <ClassificationManager
          catalog={catalog}
          search={search}
          onSearchChange={setSearch}
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
          rates={rates}
          currency={currency}
          displayUnit={displayUnit}
          decimalPlaces={decimalPlaces}
          onSetValueRates={onSetValueRates}
          disabled={disabled}
        />
      )}
    </div>
  );
}
