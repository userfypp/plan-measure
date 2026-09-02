import { useId, useRef, useState, type FormEvent } from "react";
import { Badge, Button, Dialog } from "../../components/ui";
import { useAppState } from "../../app/state";
import { useSessionState } from "../../app/sessionState";
import type { CsvExportSettings, CurrentSession } from "../../types/domain";
import {
  createCsvExportSettingsPreset,
  getCsvColumnDescriptors,
  normalizeCsvExportSettings,
  setCsvColumnEnabled,
  type CsvColumnDescriptor,
  type CsvColumnSection,
  type CsvExportPreset,
  downloadCsv,
} from "../../services/csv";
import styles from "./CsvExportDialog.module.css";

export interface CsvExportDialogProps {
  session: CurrentSession;
  pageLabels: readonly string[] | null;
  onClose: () => void;
}

const SECTION_TITLES: Record<CsvColumnSection, string> = {
  measurement: "Measurement",
  values: "Values",
  scale: "Scale",
  classification: "Classifications",
};

const SECTION_ORDER: readonly CsvColumnSection[] = [
  "measurement",
  "values",
  "scale",
  "classification",
];

export function CsvExportDialog({ session, pageLabels, onClose }: CsvExportDialogProps) {
  const { setError } = useAppState();
  const { updateSettings } = useSessionState();
  const [draft, setDraft] = useState<CsvExportSettings>(() => ({
    columnOverrides: { ...session.settings.csvExport.columnOverrides },
  }));
  const formId = useId();
  const descriptionId = useId();
  const exportInProgressRef = useRef(false);
  const descriptors = getCsvColumnDescriptors(session, draft);

  function updateColumn(columnId: string, enabled: boolean) {
    setDraft((current) => setCsvColumnEnabled(session, current, columnId, enabled));
  }

  function applyPreset(preset: CsvExportPreset) {
    setDraft(createCsvExportSettingsPreset(session, preset));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (exportInProgressRef.current) return;
    exportInProgressRef.current = true;
    try {
      downloadCsv(session, pageLabels, draft);
      updateSettings({ csvExport: normalizeCsvExportSettings(session, draft) });
      onClose();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The CSV could not be exported.",
      );
      onClose();
    }
  }

  const sectionDescriptors = (section: CsvColumnSection) =>
    descriptors.filter((descriptor) => descriptor.section === section);

  return (
    <Dialog
      open
      title="Export CSV"
      size="large"
      onClose={onClose}
      descriptionId={descriptionId}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId}>
            Export CSV
          </Button>
        </>
      }
    >
      <p id={descriptionId} className={styles.description}>
        Choose the columns to include in the export.
      </p>
      <div className={styles.bulkActions} aria-label="Column presets">
        <span>Quick selection</span>
        <Button variant="ghost" size="compact" onClick={() => applyPreset("defaults")}>
          Defaults
        </Button>
        <Button variant="ghost" size="compact" onClick={() => applyPreset("all")}>
          All columns
        </Button>
        <Button variant="ghost" size="compact" onClick={() => applyPreset("required-only")}>
          Required only
        </Button>
      </div>
      <form id={formId} className={styles.form} onSubmit={submit}>
        {SECTION_ORDER.map((section) => {
          const columns = sectionDescriptors(section);
          if (section === "classification") {
            return (
              <section
                key={section}
                className={styles.section}
                aria-labelledby={`${formId}-classification`}
              >
                <h3 id={`${formId}-classification`} className={styles.sectionTitle}>
                  {SECTION_TITLES[section]}
                </h3>
                <ClassificationGroups descriptors={columns} onChange={updateColumn} />
              </section>
            );
          }
          return (
            <section
              key={section}
              className={styles.section}
              aria-labelledby={`${formId}-${section}`}
            >
              <h3 id={`${formId}-${section}`} className={styles.sectionTitle}>
                {SECTION_TITLES[section]}
              </h3>
              <div className={styles.columnList}>
                {columns.map((descriptor) => (
                  <ColumnOption
                    key={descriptor.id}
                    descriptor={descriptor}
                    onChange={updateColumn}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </form>
    </Dialog>
  );
}

function ClassificationGroups({
  descriptors,
  onChange,
}: {
  descriptors: CsvColumnDescriptor[];
  onChange: (columnId: string, enabled: boolean) => void;
}) {
  const groups = new Map<
    string,
    { name: string; archived: boolean; columns: CsvColumnDescriptor[] }
  >();
  for (const descriptor of descriptors) {
    const classification = descriptor.classification;
    if (!classification) continue;
    const existing = groups.get(classification.dimensionId);
    if (existing) {
      existing.columns.push(descriptor);
    } else {
      groups.set(classification.dimensionId, {
        name: classification.dimensionName,
        archived: classification.dimensionArchived,
        columns: [descriptor],
      });
    }
  }

  return (
    <div className={styles.classificationList}>
      {[...groups.entries()].map(([dimensionId, group]) => (
        <section key={dimensionId} className={styles.classificationGroup} aria-label={group.name}>
          <div className={styles.classificationHeader}>
            <strong>{group.name}</strong>
            {group.archived && <Badge variant="neutral">Archived</Badge>}
          </div>
          <div className={styles.columnList}>
            {group.columns.map((descriptor) => (
              <ColumnOption key={descriptor.id} descriptor={descriptor} onChange={onChange} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ColumnOption({
  descriptor,
  onChange,
}: {
  descriptor: CsvColumnDescriptor;
  onChange: (columnId: string, enabled: boolean) => void;
}) {
  return (
    <label
      className={[styles.columnOption, descriptor.required ? styles.requiredOption : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <input
        type="checkbox"
        checked={descriptor.enabled}
        disabled={descriptor.required}
        onChange={(event) => onChange(descriptor.id, event.target.checked)}
      />
      <span className={styles.columnLabel}>{descriptor.label}</span>
      {descriptor.required && <Badge variant="info">Required</Badge>}
    </label>
  );
}
