import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Badge, Button, Dialog } from "../../components/ui";
import { useAppState } from "../../app/state";
import { useSessionState } from "../../app/sessionState";
import type { CsvExportSettings, CurrentSession } from "../../types/domain";
import {
  createCsvExportSettingsPreset,
  downloadClassificationAssignmentsCsv,
  downloadCsv,
  downloadCsvInBatches,
  getCsvColumnDescriptors,
  normalizeCsvExportSettings,
  setCsvColumnEnabled,
  type CsvColumnDescriptor,
  type CsvColumnSection,
  type CsvExportPreset,
} from "../../services/csv";
import { downloadDataJson } from "../../services/dataJson";
import { downloadSpreadsheet } from "../../services/spreadsheetExport";
import { buildTakeoffSummary } from "../../services/takeoffSummary";
import {
  buildTakeoffTables,
  downloadCsvWithTakeoff,
  downloadTakeoff,
} from "../../services/takeoffExport";
import type { TakeoffSelection } from "../measurements/measurementTotals";
import styles from "./ExportDialog.module.css";

export interface ExportDialogProps {
  session: CurrentSession;
  pageLabels: readonly string[] | null;
  onExportAnnotatedPdf?: () => Promise<void>;
  summaryBlocked?: boolean;
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
type CsvDataset = "measurements" | "classification-assignments" | "takeoff";

export function ExportDialog({
  session,
  pageLabels,
  onExportAnnotatedPdf,
  onClose,
  summaryBlocked = false,
}: ExportDialogProps) {
  const { setError } = useAppState();
  const { updateSettings } = useSessionState();
  const [draft, setDraft] = useState<CsvExportSettings>(() => ({
    columnOverrides: { ...session.settings.csvExport.columnOverrides },
  }));
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [dataset, setDataset] = useState<CsvDataset>("measurements");
  const [selection, setSelection] = useState<TakeoffSelection>({
    includeProjectTotals: false,
    breakdowns: [],
    classificationDimensionIds: [],
  });
  const includeTakeoff = Boolean(
    selection.includeProjectTotals ||
    selection.breakdowns.length ||
    selection.classificationDimensionIds.length,
  );
  const [summaryError, setSummaryError] = useState<string | null>(null);
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
  const isSummary = (isWorkbook || format === "csv") && dataset === "takeoff";
  const exportsTakeoff = includeTakeoff && (isWorkbook || format === "csv" || format === "json");
  const hasMeasurementColumns =
    !isSummary && (isWorkbook || (format === "csv" && dataset === "measurements"));
  const summary = useMemo(() => {
    if (!exportsTakeoff) return null;
    try {
      if (format === "json") {
        const report = buildTakeoffSummary(session, selection, pageLabels);
        const groups = [
          report.projectTotals,
          ...report.breakdowns.flatMap((breakdown) => breakdown.groups),
        ];
        return {
          tables: {
            linearUnit: report.linearUnit,
            areaUnit: report.areaUnit,
            excludedCount: report.projectTotals.excludedCount,
            hasUnavailable: groups.some((group) =>
              [group.length, group.perimeter, group.area].some(
                (quantity) => quantity.kind === "unavailable",
              ),
            ),
          },
          error: null,
        };
      }
      return { tables: buildTakeoffTables(session, selection, pageLabels), error: null };
    } catch (error) {
      return {
        tables: null,
        error: error instanceof Error ? error.message : "The summary cannot be exported.",
      };
    }
  }, [exportsTakeoff, format, session, selection, pageLabels]);
  const summaryBlockedMessage = summaryBlocked
    ? "Finish or cancel the current edit before exporting the summary."
    : summary?.error;
  const excludedCount = summary?.tables?.excludedCount ?? 0;
  const hasUnavailable = summary?.tables?.hasUnavailable ?? false;

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

  function updateSummarySelection(next: TakeoffSelection) {
    setSummaryError(null);
    setSelection(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      exportInProgressRef.current ||
      (isSummary && !includeTakeoff) ||
      (exportsTakeoff && summaryBlockedMessage)
    )
      return;
    setSummaryError(null);
    exportInProgressRef.current = true;
    setExportInProgress(true);
    try {
      if (format === "annotated-pdf") {
        if (!onExportAnnotatedPdf) {
          throw new Error("Wait for the PDF to finish loading before exporting it.");
        }
        await onExportAnnotatedPdf();
      } else if (format === "json") {
        if (includeTakeoff) downloadDataJson(session, pageLabels, selection);
        else downloadDataJson(session, pageLabels);
      } else if (isSummary && (format === "csv" || format === "xlsx" || format === "ods")) {
        await downloadTakeoff(format, session, selection, pageLabels);
      } else if (format === "xlsx" || format === "ods") {
        if (includeTakeoff) {
          const tables = buildTakeoffTables(session, selection, pageLabels);
          await downloadSpreadsheet(format, session, pageLabels, draft, [
            ...(tables.project.rows.length ? [["Project totals", tables.project] as const] : []),
            ...tables.breakdowns,
          ]);
        } else await downloadSpreadsheet(format, session, pageLabels, draft);
        updateSettings({ csvExport: normalizeCsvExportSettings(session, draft) });
      } else if (includeTakeoff) {
        await downloadCsvWithTakeoff(
          session,
          selection,
          pageLabels,
          draft,
          dataset === "classification-assignments" ? "classification-assignments" : "measurements",
        );
        if (dataset === "measurements")
          updateSettings({ csvExport: normalizeCsvExportSettings(session, draft) });
      } else if (dataset === "classification-assignments") {
        downloadClassificationAssignmentsCsv(session, pageLabels);
      } else {
        if (Object.values(session.pages).reduce((count, page) => count + page.measurements.length, 0) > 500)
          await downloadCsvInBatches(session, pageLabels, draft);
        else downloadCsv(session, pageLabels, draft);
        updateSettings({ csvExport: normalizeCsvExportSettings(session, draft) });
      }
      exportInProgressRef.current = false;
      setExportInProgress(false);
      onClose();
    } catch (error) {
      exportInProgressRef.current = false;
      setExportInProgress(false);
      const message = error instanceof Error ? error.message : "The file could not be exported.";
      if (exportsTakeoff) setSummaryError(message);
      else {
        setError(message);
        onClose();
      }
    }
  }

  const sectionDescriptors = (section: CsvColumnSection) =>
    descriptors.filter((descriptor) => descriptor.section === section);

  return (
    <Dialog
      open
      title="Export"
      size="large"
      className={`${styles.dialog} ${format === "json" ? styles.jsonMode : ""}`}
      bodyClassName={`${styles.dialogBody} ${hasMeasurementColumns ? "" : styles.standaloneBody}`}
      descriptionId={formatDescription ? descriptionId : undefined}
      onClose={() => {
        if (!exportInProgressRef.current) onClose();
      }}
      actions={
        <div className={styles.exportFooter}>
          <div className={styles.footerInfo}>
            {exportsTakeoff ? (
              <p className={styles.footerScope}>
                All pages · Includes hidden
                {summary?.tables && (
                  <>
                    {" "}
                    · {summary.tables.linearUnit} / {summary.tables.areaUnit} · Full precision
                  </>
                )}
                {format === "csv" && !isSummary && <> · ZIP with separate CSV files</>}
              </p>
            ) : isSummary ? (
              <p className={styles.footerScope}>Select at least one summary.</p>
            ) : null}
          </div>
          <div className={styles.footerButtons}>
            <Button
              size="compact"
              variant="secondary"
              disabled={exportInProgress}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              size="compact"
              type="submit"
              form={formId}
              disabled={
                exportInProgress ||
                (isSummary && !includeTakeoff) ||
                Boolean(exportsTakeoff && summaryBlockedMessage)
              }
            >
              {exportInProgress
                ? "Exporting…"
                : format === "csv" && includeTakeoff && !isSummary
                  ? "Export ZIP"
                  : EXPORT_LABELS[format]}
            </Button>
          </div>
        </div>
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
                  onChange={(event) => {
                    setSummaryError(null);
                    setFormat(event.target.value as ExportFormat);
                  }}
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
              {(format === "csv" || isWorkbook) && (
                <div className={styles.field}>
                  <label htmlFor={datasetId}>Data</label>
                  <select
                    id={datasetId}
                    name="csv-data"
                    value={
                      isWorkbook && dataset === "classification-assignments"
                        ? "measurements"
                        : dataset
                    }
                    onChange={(event) => {
                      setSummaryError(null);
                      setDataset(event.target.value as CsvDataset);
                    }}
                  >
                    <option value="measurements">
                      {isWorkbook ? "Measurements and classifications" : "Measurements"}
                    </option>
                    {format === "csv" && (
                      <option value="classification-assignments">Classification assignments</option>
                    )}
                    <option value="takeoff">Takeoff summary</option>
                  </select>
                </div>
              )}
            </div>
            {(format === "json" ||
              (format === "csv" && dataset === "classification-assignments")) && (
              <SummaryOptions
                session={session}
                selection={selection}
                section="all"
                onChange={updateSummarySelection}
              />
            )}
            {isSummary && (
              <SummaryOptions
                session={session}
                selection={selection}
                section="all"
                onChange={updateSummarySelection}
              />
            )}
            {exportsTakeoff && (
              <>
                {(excludedCount > 0 || hasUnavailable) && (
                  <p className={styles.summaryNotice} role="status">
                    {excludedCount > 0 &&
                      `${excludedCount} measurement${excludedCount === 1 ? "" : "s"} excluded. `}
                    {format === "json"
                      ? "Non-calculable totals are identified in the summary."
                      : "Missing or non-calculable quantities export as blank cells with a status."}
                  </p>
                )}
                {(summaryBlockedMessage || summaryError) && (
                  <p className={styles.summaryNotice} role="alert">
                    {summaryBlockedMessage || summaryError}
                  </p>
                )}
              </>
            )}
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
                  {(isWorkbook || format === "csv") && (
                    <SummaryOptions
                      session={session}
                      selection={selection}
                      section="basic"
                      onChange={updateSummarySelection}
                    />
                  )}
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
                    className={styles.panel}
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
                      {(isWorkbook || format === "csv") && (
                        <SummaryOptions
                          session={session}
                          selection={selection}
                          section="classification"
                          onChange={updateSummarySelection}
                        />
                      )}
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
                    {(isWorkbook || format === "csv") && includeTakeoff && (
                      <p className={styles.summaryScope}>
                        Takeoff sheets include group and dimension IDs, excluded counts and quantity
                        statuses.
                      </p>
                    )}
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
          <div className={styles.classificationFields}>
            {group.columns.map((descriptor) => (
              <ColumnOption
                key={descriptor.id}
                descriptor={descriptor}
                onChange={onChange}
                classification
              />
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

function SummaryOptions({
  session,
  selection,
  section,
  onChange,
}: {
  session: CurrentSession;
  selection: TakeoffSelection;
  section: "basic" | "classification" | "all";
  onChange: (selection: TakeoffSelection) => void;
}) {
  return (
    <div className={styles.summaryOptions}>
      {section !== "classification" && (
        <div className={styles.summaryChoiceGroup} role="group" aria-label="Takeoff breakdowns">
          <span className={styles.sectionTitle}>Takeoff summaries</span>
          <div className={`${styles.summaryChoices} ${styles.basicChoices}`}>
            <label className={`${styles.columnOption} ${styles.summaryChoice}`}>
              <input
                type="checkbox"
                checked={selection.includeProjectTotals === true}
                onChange={(event) =>
                  onChange({ ...selection, includeProjectTotals: event.target.checked })
                }
              />
              Project totals
            </label>
            {(["page", "type"] as const).map((breakdown) => (
              <label key={breakdown} className={`${styles.columnOption} ${styles.summaryChoice}`}>
                <input
                  type="checkbox"
                  checked={selection.breakdowns.includes(breakdown)}
                  onChange={(event) =>
                    onChange({
                      ...selection,
                      breakdowns: event.target.checked
                        ? [...selection.breakdowns, breakdown]
                        : selection.breakdowns.filter((value) => value !== breakdown),
                    })
                  }
                />
                {breakdown === "page" ? "By page" : "By type"}
              </label>
            ))}
          </div>
        </div>
      )}
      {section !== "basic" && session.classificationCatalog.dimensions.length > 0 && (
        <div
          className={styles.summaryChoiceGroup}
          role="group"
          aria-label="Takeoff classifications"
        >
          <span className={styles.sectionTitle}>Classification breakdowns</span>
          <div className={styles.summaryChoices}>
            {session.classificationCatalog.dimensions.map((dimension) => (
              <label
                key={dimension.id}
                className={`${styles.columnOption} ${styles.summaryChoice}`}
              >
                <input
                  type="checkbox"
                  checked={selection.classificationDimensionIds.includes(dimension.id)}
                  onChange={(event) =>
                    onChange({
                      ...selection,
                      classificationDimensionIds: event.target.checked
                        ? [...selection.classificationDimensionIds, dimension.id]
                        : selection.classificationDimensionIds.filter((id) => id !== dimension.id),
                    })
                  }
                />
                {dimension.name}
                {dimension.archived ? " (archived)" : ""}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
