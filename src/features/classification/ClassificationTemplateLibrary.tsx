import { useId, useState, type FormEvent } from "react";
import {
  Button,
  CheckIcon,
  Dialog,
  Disclosure,
  IconButton,
  ImportIcon,
  InlineField,
  SaveIcon,
  TrashIcon,
} from "../../components/ui";
import type { ClassificationCatalog, ClassificationValueRates } from "../../types/domain";
import { classificationNameKey, classificationSearchKey } from "../../utils/classificationNames";
import {
  applyTemplateDimensions,
  readClassificationTemplates,
  templateDimensions,
  validTemplateDimensions,
  writeClassificationTemplates,
  type ClassificationTemplate,
  type TemplateConflict,
  type TemplateConflictPolicy,
} from "./classificationTemplates";
import styles from "./ClassificationWorkspace.module.css";

const APPLY_NOTE = "Apply to project: adds missing entries and keeps existing assignments.";
const SAVE_NOTE = "Save as template: active dimensions, values, quantities and prices.";
const SKIPPED_PRICES_NOTE =
  "Prices were not applied because the template currency differs from the project currency.";
const MAX_LISTED_CONFLICTS = 5;

function conflictList(conflicts: TemplateConflict[]) {
  const listed = conflicts
    .slice(0, MAX_LISTED_CONFLICTS)
    .map((item) => `${item.dimension}: ${item.value}`);
  const more = conflicts.length - listed.length;
  return more > 0 ? `${listed.join("; ")} and ${more} more` : listed.join("; ");
}

export function ClassificationTemplateLibrary({
  catalog,
  rates,
  currency,
  disabled,
  search = "",
  onApply,
}: {
  catalog: ClassificationCatalog;
  /** The workspace header's search: templates are filtered by it. */
  search?: string;
  rates: ClassificationValueRates[];
  currency: string | null;
  disabled: boolean;
  onApply: (template: ClassificationTemplate, policy: TemplateConflictPolicy) => boolean;
}) {
  const [library, setLibrary] = useState(readClassificationTemplates);
  const [name, setName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [applied, setApplied] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{
    template: ClassificationTemplate;
    conflicts: TemplateConflict[];
    pricesSkipped: boolean;
  } | null>(null);
  const descriptionId = useId();
  const dimensions = templateDimensions(catalog, rates);
  const canSave = validTemplateDimensions(dimensions);
  const searchTerm = classificationSearchKey(search).trim();
  // A template matches by its own name or by the name of any of its dimensions and values.
  const shownTemplates = searchTerm
    ? library.templates.filter((template) =>
        [
          template.name,
          ...template.dimensions.flatMap((dimension) => [dimension.name, ...dimension.values]),
        ].some((text) => classificationSearchKey(text).includes(searchTerm)),
      )
    : library.templates;

  function clearErrors() {
    setSaveError(null);
    setListError(null);
  }

  function persist(
    templates: ClassificationTemplate[],
    message: string,
    report: (message: string | null) => void,
  ) {
    const latest = readClassificationTemplates();
    if (latest.error || JSON.stringify(latest.templates) !== JSON.stringify(library.templates)) {
      setLibrary(latest);
      report(
        latest.error
          ? null
          : "Saved templates changed in another window. Review the updated library and try again.",
      );
      setStatus("");
      setApplied(null);
      setDeleting(null);
      return false;
    }
    const failure = writeClassificationTemplates(templates);
    report(failure);
    if (failure) return false;
    setLibrary({ templates, error: null });
    setStatus(message);
    setApplied(null);
    return true;
  }

  function apply(
    template: ClassificationTemplate,
    policy: TemplateConflictPolicy,
    pricesSkipped = false,
  ) {
    setConflict(null);
    if (disabled) return;
    if (onApply(template, policy)) {
      clearErrors();
      setStatus(
        `Template “${template.name}” applied.${pricesSkipped ? ` ${SKIPPED_PRICES_NOTE}` : ""}`,
      );
      setApplied(template.id);
    } else {
      setApplied(null);
    }
  }

  function requestApply(template: ClassificationTemplate) {
    if (disabled) return;
    let preview: ReturnType<typeof applyTemplateDimensions> | null = null;
    try {
      preview = applyTemplateDimensions(catalog, rates, currency, template);
    } catch {
      // The session command reports why the template cannot be applied.
    }
    if (preview?.conflicts.length)
      setConflict({
        template,
        conflicts: preview.conflicts,
        pricesSkipped: preview.pricesSkipped,
      });
    else apply(template, "keep", preview?.pricesSkipped);
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (disabled || library.error || !canSave || !name.trim()) return;
    const trimmed = name.trim();
    if (
      library.templates.some(
        (template) => classificationNameKey(template.name) === classificationNameKey(trimmed),
      )
    ) {
      setSaveError("Template names must be unique. Choose another name.");
      return;
    }
    clearErrors();
    if (
      persist(
        [...library.templates, { id: crypto.randomUUID(), name: trimmed, currency, dimensions }],
        `Template “${trimmed}” saved.`,
        setSaveError,
      )
    )
      setName("");
  }

  return (
    <section className={styles.library} aria-label="Classification templates">
      {library.error && (
        <p className={styles.feedback} role="alert">
          {library.error}
        </p>
      )}
      {listError && (
        <p className={styles.feedback} role="alert">
          {listError}
        </p>
      )}
      <p className={styles.visuallyHidden} role="status">
        {status}
      </p>
      {!library.error && !library.templates.length && (
        <div className={styles.emptyState}>
          <h3>No templates yet</h3>
          <p className={styles.note}>
            Save this project's classifications to reuse them on your next plan.
          </p>
        </div>
      )}
      {shownTemplates.length === 0 && library.templates.length > 0 && (
        <p className={styles.noMatches} role="status">
          No template matches
        </p>
      )}
      {shownTemplates.length > 0 && (
        <ul className={styles.templates} aria-label="Saved classification templates">
          {shownTemplates.map((template) => {
            const valueCount = template.dimensions.reduce(
              (total, dimension) => total + dimension.values.length,
              0,
            );
            return (
              <li className={styles.template} key={template.id}>
                <Disclosure
                  title={template.name}
                  subtitle={
                    <>
                      {template.dimensions.length}{" "}
                      {template.dimensions.length === 1 ? "dimension" : "dimensions"} · {valueCount}{" "}
                      {valueCount === 1 ? "value" : "values"}
                    </>
                  }
                  actions={
                    <IconButton
                      icon={applied === template.id ? <CheckIcon /> : <ImportIcon />}
                      tooltip={applied === template.id ? "Applied" : APPLY_NOTE}
                      disabled={disabled}
                      aria-label={`Apply template ${template.name}`}
                      onClick={() => requestApply(template)}
                    />
                  }
                >
                  <dl className={styles.preview}>
                    {template.dimensions.map((dimension) => (
                      <div key={dimension.name}>
                        <dt>{dimension.name}</dt>
                        <dd>{dimension.values.join(", ") || "No values"}</dd>
                      </div>
                    ))}
                  </dl>
                  {deleting === template.id ? (
                    <div className={`${styles.templateActions} ${styles.confirm}`}>
                      <p className={styles.note}>
                        Delete this template? Applied classifications are kept.
                      </p>
                      <Button size="compact" variant="ghost" onClick={() => setDeleting(null)}>
                        Cancel
                      </Button>
                      <Button
                        size="compact"
                        variant="danger"
                        disabled={disabled}
                        onClick={() => {
                          clearErrors();
                          if (
                            persist(
                              library.templates.filter((item) => item.id !== template.id),
                              `Template “${template.name}” deleted.`,
                              setListError,
                            )
                          )
                            setDeleting(null);
                        }}
                      >
                        Delete template
                      </Button>
                    </div>
                  ) : (
                    <div className={styles.templateActions}>
                      <IconButton
                        icon={<TrashIcon />}
                        tone="danger"
                        tooltip="Delete"
                        disabled={disabled}
                        aria-label={`Delete template ${template.name}`}
                        onClick={() => setDeleting(template.id)}
                      />
                    </div>
                  )}
                </Disclosure>
              </li>
            );
          })}
        </ul>
      )}
      <InlineField
        variant="row"
        label="Save project as template"
        value={name}
        error={saveError}
        disabled={disabled || !!library.error || !canSave}
        placeholder="Template name"
        onChange={(event) => {
          setName(event.target.value);
          setSaveError(null);
        }}
        onSubmit={save}
        actions={
          <IconButton
            type="submit"
            tone="primary"
            icon={<SaveIcon />}
            tooltip={SAVE_NOTE}
            aria-label="Save template"
            disabled={disabled || !!library.error || !canSave || !name.trim()}
            disabledReason={
              canSave ? undefined : "Create an active dimension with unique names before saving."
            }
          />
        }
      />
      {conflict && (
        <Dialog
          open
          size="small"
          title="Existing quantities and prices differ"
          descriptionId={descriptionId}
          onClose={() => setConflict(null)}
          actions={
            <>
              <Button variant="ghost" size="compact" onClick={() => setConflict(null)}>
                Cancel
              </Button>
              <Button
                variant="secondary"
                size="compact"
                onClick={() => apply(conflict.template, "keep", conflict.pricesSkipped)}
              >
                Keep existing
              </Button>
              <Button
                size="compact"
                onClick={() => apply(conflict.template, "replace", conflict.pricesSkipped)}
              >
                Replace
              </Button>
            </>
          }
        >
          <p id={descriptionId}>
            {conflictList(conflict.conflicts)} already have different quantity or price settings.
            Keep existing applies the template without changing them. Replace overwrites them with
            the template settings.
            {conflict.pricesSkipped && ` ${SKIPPED_PRICES_NOTE}`}
          </p>
        </Dialog>
      )}
    </section>
  );
}
