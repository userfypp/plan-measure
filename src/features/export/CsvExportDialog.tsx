import { useId, useRef, useState, type FormEvent } from "react";
import { Badge, Button, Dialog } from "../../components/ui";
import { useAppState } from "../../app/state";
import { useSessionState } from "../../app/sessionState";
import type { CsvExportSettings, CurrentSession } from "../../types/domain";
import {
  createCsvExportSettingsPreset,
  downloadClassificationAssignmentsCsv,
  downloadCsv,
  getCsvColumnDescriptors,
  normalizeCsvExportSettings,
  setCsvColumnEnabled,
  type CsvColumnDescriptor,
  type CsvColumnSection,
  type CsvExportPreset,
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
  additional: "Additional data",
  classification: "Classifications",
};

const PRIMARY_SECTION_ORDER: readonly CsvColumnSection[] = ["measurement", "values", "scale"];

type CsvDataset = "measurements" | "classification-assignments";

export function CsvExportDialog({ session, pageLabels, onClose }: CsvExportDialogProps) {
  const { setError } = useAppState();
  const { updateSettings } = useSessionState();
  const [draft, setDraft] = useState<CsvExportSettings>(() => ({
    columnOverrides: { ...session.settings.csvExport.columnOverrides },
  }));
  const [dataset, setDataset] = useState<CsvDataset>("measurements");
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
      if (dataset === "classification-assignments") {
        downloadClassificationAssignmentsCsv(session, pageLabels);
        onClose();
        return;
      }
      downloadCsv(session, pageLabels, draft);
      updateSettings({ csvExport: normalizeCsvExportSettings(session, draft) });
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "The CSV could not be exported.");
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
      descriptionId={dataset === "classification-assignments" ? descriptionId : undefined}
      actions={
        <>
          <Button className={styles.footerButton} variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button className={styles.footerButton} type="submit" form={formId}>
            Export CSV
          </Button>
        </>
      }
    >
      <fieldset className={styles.datasetGroup}>
        <legend className={styles.visuallyHidden}>CSV data</legend>
        <div className={styles.datasetOptions}>
          <label>
            <input
              type="radio"
              name="csv-data"
              value="measurements"
              checked={dataset === "measurements"}
              onChange={() => setDataset("measurements")}
            />
            <span className={styles.datasetOption}>Measurements</span>
          </label>
          <label>
            <input
              type="radio"
              name="csv-data"
              value="classification-assignments"
              checked={dataset === "classification-assignments"}
              onChange={() => setDataset("classification-assignments")}
            />
            <span className={styles.datasetOption}>Classification assignments</span>
          </label>
        </div>
      </fieldset>

      {dataset === "classification-assignments" && (
        <p id={descriptionId} className={styles.assignmentDescription}>
          Exports one row per assigned classification. Use measurement_id to relate each assignment
          to the Measurements CSV.
        </p>
      )}

      {dataset === "measurements" && (
        <div className={styles.bulkActions} aria-label="Column presets">
          <Button
            className={styles.presetButton}
            variant="secondary"
            size="compact"
            onClick={() => applyPreset("defaults")}
          >
            Defaults
          </Button>
          <Button
            className={styles.presetButton}
            variant="secondary"
            size="compact"
            onClick={() => applyPreset("all")}
          >
            All columns
          </Button>
          <Button
            className={styles.presetButton}
            variant="secondary"
            size="compact"
            onClick={() => applyPreset("required-only")}
          >
            Required only
          </Button>
        </div>
      )}

      <form id={formId} className={styles.form} onSubmit={submit}>
        {dataset === "measurements" && (
          <>
            <div className={styles.primarySections}>
              {PRIMARY_SECTION_ORDER.map((section) => (
                <section
                  key={section}
                  className={styles.section}
                  aria-labelledby={`${formId}-${section}`}
                >
                  <h3 id={`${formId}-${section}`} className={styles.sectionTitle}>
                    {SECTION_TITLES[section]}
                  </h3>
                  <div className={styles.columnList}>
                    {sectionDescriptors(section).map((descriptor) => (
                      <ColumnOption
                        key={descriptor.id}
                        descriptor={descriptor}
                        onChange={updateColumn}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>

            {sectionDescriptors("additional").length > 0 && (
              <section
                className={styles.additionalSection}
                aria-labelledby={`${formId}-additional`}
              >
                <h3 id={`${formId}-additional`} className={styles.sectionTitle}>
                  {SECTION_TITLES.additional}
                </h3>
                <div className={styles.additionalGrid}>
                  {sectionDescriptors("additional").map((descriptor) => (
                    <ColumnOption
                      key={descriptor.id}
                      descriptor={descriptor}
                      onChange={updateColumn}
                    />
                  ))}
                </div>
              </section>
            )}

            {sectionDescriptors("classification").length > 0 && (
              <section
                className={styles.classificationSection}
                aria-labelledby={`${formId}-classification`}
              >
                <h3 id={`${formId}-classification`} className={styles.sectionTitle}>
                  {SECTION_TITLES.classification}
                </h3>
                <ClassificationGroups
                  descriptors={sectionDescriptors("classification")}
                  onChange={updateColumn}
                />
              </section>
            )}
          </>
        )}
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
    <div className={styles.classificationGrid}>
      <div className={styles.classificationColumnsHeader} aria-hidden="true">
        <span>Dimension</span>
        <span>Value</span>
        <span>Value ID</span>
        <span>Status</span>
      </div>
      {[...groups.entries()].map(([dimensionId, group]) => (
        <section key={dimensionId} className={styles.classificationRow} aria-label={group.name}>
          <div className={styles.classificationDimension}>
            <span>{group.name}</span>
            {group.archived && (
              <Badge variant="neutral" className={styles.compactBadge}>
                Archived
              </Badge>
            )}
          </div>
          {group.columns.map((descriptor) => (
            <ColumnOption
              key={descriptor.id}
              descriptor={descriptor}
              onChange={onChange}
              classification
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function ColumnOption({
  descriptor,
  onChange,
  classification = false,
}: {
  descriptor: CsvColumnDescriptor;
  onChange: (columnId: string, enabled: boolean) => void;
  classification?: boolean;
}) {
  return (
    <label
      className={[
        styles.columnOption,
        descriptor.required ? styles.requiredOption : "",
        classification ? styles.classificationOption : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <input
        type="checkbox"
        checked={descriptor.enabled}
        disabled={descriptor.required}
        onChange={(event) => onChange(descriptor.id, event.target.checked)}
      />
      <span
        className={[styles.columnLabel, classification ? styles.classificationColumnLabel : ""]
          .filter(Boolean)
          .join(" ")}
      >
        {descriptor.label}
      </span>
      {descriptor.required && (
        <Badge variant="neutral" className={styles.requiredBadge}>
          Required
        </Badge>
      )}
    </label>
  );
}
