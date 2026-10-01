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
import { downloadDataJson } from "../../services/dataJson";
import { downloadSpreadsheet } from "../../services/spreadsheetExport";
import styles from "./ExportDialog.module.css";

export interface ExportDialogProps {
  session: CurrentSession;
  pageLabels: readonly string[] | null;
  onExportAnnotatedPdf?: () => Promise<void>;
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

type ExportFormat = "csv" | "xlsx" | "ods" | "json" | "annotated-pdf";

const FORMAT_LABELS: Record<ExportFormat, string> = {
  csv: "CSV",
  xlsx: "Excel workbook (.xlsx)",
  ods: "OpenDocument spreadsheet (.ods)",
  json: "JSON data",
  "annotated-pdf": "Annotated PDF",
};
const EXPORT_LABELS: Record<ExportFormat, string> = {
  csv: "Export CSV",
  xlsx: "Export XLSX",
  ods: "Export ODS",
  json: "Export JSON",
  "annotated-pdf": "Export PDF",
};
type CsvDataset = "measurements" | "classification-assignments";

export function ExportDialog({
  session,
  pageLabels,
  onExportAnnotatedPdf,
  onClose,
}: ExportDialogProps) {
  const { setError } = useAppState();
  const { updateSettings } = useSessionState();
  const [draft, setDraft] = useState<CsvExportSettings>(() => ({
    columnOverrides: { ...session.settings.csvExport.columnOverrides },
  }));
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [dataset, setDataset] = useState<CsvDataset>("measurements");
  const [exportInProgress, setExportInProgress] = useState(false);
  const formId = useId();
  const columnPanelId = useId();
  const [columnSection, setColumnSection] = useState<CsvColumnSection>("measurement");
  const formatId = useId();
  const datasetId = useId();
  const descriptionId = useId();
  const exportInProgressRef = useRef(false);
  const descriptors = getCsvColumnDescriptors(session, draft);
  const isWorkbook = format === "xlsx" || format === "ods";
  const hasMeasurementColumns = isWorkbook || (format === "csv" && dataset === "measurements");
  const formatDescription =
    format === "json"
      ? "Complete measurement data, geometry, scales, and classifications from all pages, including hidden measurements. Does not include the PDF."
      : format === "annotated-pdf"
        ? "Original PDF annotated with visible measurements. Hidden measurements are excluded."
        : null;

  function updateColumn(columnId: string, enabled: boolean) {
    setDraft((current) => setCsvColumnEnabled(session, current, columnId, enabled));
  }

  function applyPreset(preset: CsvExportPreset) {
    setDraft(createCsvExportSettingsPreset(session, preset));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (exportInProgressRef.current) return;
    exportInProgressRef.current = true;
    setExportInProgress(true);
    try {
      if (format === "annotated-pdf") {
        if (!onExportAnnotatedPdf) {
          throw new Error("Wait for the PDF to finish loading before exporting it.");
        }
        await onExportAnnotatedPdf();
      } else if (format === "json") {
        downloadDataJson(session, pageLabels);
      } else if (format === "xlsx" || format === "ods") {
        await downloadSpreadsheet(format, session, pageLabels, draft);
        updateSettings({ csvExport: normalizeCsvExportSettings(session, draft) });
      } else if (dataset === "classification-assignments") {
        downloadClassificationAssignmentsCsv(session, pageLabels);
      } else {
        downloadCsv(session, pageLabels, draft);
        updateSettings({ csvExport: normalizeCsvExportSettings(session, draft) });
      }
      exportInProgressRef.current = false;
      setExportInProgress(false);
      onClose();
    } catch (error) {
      exportInProgressRef.current = false;
      setExportInProgress(false);
      setError(error instanceof Error ? error.message : "The file could not be exported.");
      onClose();
    }
  }

  const sectionDescriptors = (section: CsvColumnSection) =>
    descriptors.filter((descriptor) => descriptor.section === section);

  return (
    <Dialog
      open
      title="Export"
      size="large"
      className={styles.dialog}
      bodyClassName={styles.dialogBody}
      descriptionId={formatDescription ? descriptionId : undefined}
      onClose={() => {
        if (!exportInProgressRef.current) onClose();
      }}
      actions={
        <>
          <Button size="compact" variant="secondary" disabled={exportInProgress} onClick={onClose}>
            Cancel
          </Button>
          <Button size="compact" type="submit" form={formId} disabled={exportInProgress}>
            {exportInProgress ? "Exporting…" : EXPORT_LABELS[format]}
          </Button>
        </>
      }
    >
      <form id={formId} className={styles.form} onSubmit={submit}>
        <fieldset className={styles.controls} disabled={exportInProgress}>
          <div className={styles.controlsContent}>
            <div className={styles.exportFields}>
              <div className={styles.field}>
                <label htmlFor={formatId}>Format</label>
                <select
                  id={formatId}
                  name="export-format"
                  value={format}
                  aria-describedby={formatDescription ? descriptionId : undefined}
                  onChange={(event) => setFormat(event.target.value as ExportFormat)}
                >
                  {Object.entries(FORMAT_LABELS).map(([value, label]) => (
                    <option
                      key={value}
                      value={value}
                      disabled={value === "annotated-pdf" && !onExportAnnotatedPdf}
                    >
                      {label}
                    </option>
                  ))}
                </select>
                {formatDescription && (
                  <p id={descriptionId} className={styles.formatDescription}>
                    {formatDescription}
                  </p>
                )}
              </div>
              {format === "csv" && (
                <div className={styles.field}>
                  <label htmlFor={datasetId}>Data</label>
                  <select
                    id={datasetId}
                    name="csv-data"
                    value={dataset}
                    onChange={(event) => setDataset(event.target.value as CsvDataset)}
                  >
                    <option value="measurements">Measurements</option>
                    <option value="classification-assignments">Classification assignments</option>
                  </select>
                </div>
              )}
            </div>
            {hasMeasurementColumns && (
              <section className={styles.columnSettings} aria-label="Measurement columns">
                <div className={styles.columnToolbar}>
                  <div className={styles.sectionTabs} role="tablist" aria-label="Column groups">
                    {(
                      [
                        ["measurement", "Measurements"],
                        ["classification", "Classifications"],
                        ["additional", "Technical data"],
                      ] as const
                    )
                      .filter(
                        ([section]) =>
                          section !== "classification" || sectionDescriptors(section).length > 0,
                      )
                      .map(([section, label]) => (
                        <button
                          key={section}
                          type="button"
                          role="tab"
                          id={`${columnPanelId}-${section}-tab`}
                          aria-controls={`${columnPanelId}-${section}`}
                          aria-selected={columnSection === section}
                          tabIndex={columnSection === section ? 0 : -1}
                          onClick={() => setColumnSection(section)}
                          onKeyDown={(event) => {
                            const tabs = Array.from(
                              event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>(
                                '[role="tab"]',
                              ),
                            );
                            const current = tabs.indexOf(event.currentTarget);
                            const next =
                              event.key === "ArrowRight"
                                ? (current + 1) % tabs.length
                                : event.key === "ArrowLeft"
                                  ? (current + tabs.length - 1) % tabs.length
                                  : event.key === "Home"
                                    ? 0
                                    : event.key === "End"
                                      ? tabs.length - 1
                                      : null;
                            if (next === null) return;
                            event.preventDefault();
                            tabs[next]!.click();
                            tabs[next]!.focus();
                          }}
                        >
                          {label}
                        </button>
                      ))}
                  </div>
                  <span className={styles.selectedCount}>
                    {descriptors.filter((column) => column.enabled).length} selected
                  </span>
                  <div className={styles.bulkActions} aria-label="Column presets">
                    <Button
                      variant="secondary"
                      size="compact"
                      onClick={() => applyPreset("defaults")}
                    >
                      Defaults
                    </Button>
                    <Button variant="secondary" size="compact" onClick={() => applyPreset("all")}>
                      All columns
                    </Button>
                    <Button
                      variant="secondary"
                      size="compact"
                      onClick={() => applyPreset("required-only")}
                    >
                      Required only
                    </Button>
                  </div>
                </div>
                <div
                  className={styles.panel}
                  role="tabpanel"
                  tabIndex={0}
                  id={`${columnPanelId}-measurement`}
                  aria-labelledby={`${columnPanelId}-measurement-tab`}
                  hidden={columnSection !== "measurement"}
                >
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
                </div>
                {sectionDescriptors("classification").length > 0 && (
                  <div
                    className={`${styles.panel} ${styles.classificationPanel}`}
                    role="tabpanel"
                    tabIndex={0}
                    id={`${columnPanelId}-classification`}
                    aria-labelledby={`${columnPanelId}-classification-tab`}
                    hidden={columnSection !== "classification"}
                  >
                    <section
                      className={styles.classificationSection}
                      aria-labelledby={`${formId}-classification`}
                    >
                      <h3 id={`${formId}-classification`} className={styles.visuallyHidden}>
                        {SECTION_TITLES.classification}
                      </h3>
                      <ClassificationGroups
                        descriptors={sectionDescriptors("classification")}
                        onChange={updateColumn}
                      />
                    </section>
                  </div>
                )}
                {sectionDescriptors("additional").length > 0 && (
                  <div
                    className={styles.panel}
                    role="tabpanel"
                    tabIndex={0}
                    id={`${columnPanelId}-additional`}
                    aria-labelledby={`${columnPanelId}-additional-tab`}
                    hidden={columnSection !== "additional"}
                  >
                    <div className={styles.additionalGrid}>
                      {sectionDescriptors("additional").map((descriptor) => (
                        <ColumnOption
                          key={descriptor.id}
                          descriptor={descriptor}
                          onChange={updateColumn}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>
        </fieldset>
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
