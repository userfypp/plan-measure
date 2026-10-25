import { useState, type FormEvent } from "react";
import { Button, ChevronDownIcon, IconButton, Input, Tooltip } from "../../components/ui";
import type { ClassificationCatalog } from "../../types/domain";
import { classificationNameKey } from "../../utils/classificationNames";
import {
  readClassificationTemplates,
  templateDimensions,
  validTemplateDimensions,
  writeClassificationTemplates,
  type ClassificationTemplate,
  type ClassificationTemplateDimension,
} from "./classificationTemplates";
import styles from "./ClassificationWorkspace.module.css";

const deleteIcon = (
  <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
    <path d="M3.25 5.5h13.5M7.75 5.5V4.25A1.25 1.25 0 0 1 9 3h2a1.25 1.25 0 0 1 1.25 1.25V5.5M5.25 5.5v10A1.75 1.75 0 0 0 7 17.25h6a1.75 1.75 0 0 0 1.75-1.75v-10M8.25 8.75v5M11.75 8.75v5" />
  </svg>
);

const checkIcon = (
  <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
    <path d="m4.5 10.5 3.5 3.5 7.5-8" />
  </svg>
);

const APPLY_NOTE = "Adds missing entries and keeps existing assignments.";

export function ClassificationTemplateLibrary({
  catalog,
  disabled,
  onApply,
}: {
  catalog: ClassificationCatalog;
  disabled: boolean;
  onApply: (dimensions: ClassificationTemplateDimension[]) => boolean;
}) {
  const [library, setLibrary] = useState(readClassificationTemplates);
  const [name, setName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [applied, setApplied] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const dimensions = templateDimensions(catalog);
  const canSave = validTemplateDimensions(dimensions);

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
        [...library.templates, { id: crypto.randomUUID(), name: trimmed, dimensions }],
        `Template “${trimmed}” saved.`,
        setSaveError,
      )
    )
      setName("");
  }

  const saveButton = (
    <Button
      type="submit"
      size="compact"
      variant="secondary"
      aria-label="Save template"
      disabled={disabled || !!library.error || !canSave || !name.trim()}
      disabledReason={
        canSave ? undefined : "Create an active dimension with unique names before saving."
      }
    >
      Save
    </Button>
  );

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
      {library.templates.length > 0 && (
        <ul className={styles.templates} aria-label="Saved classification templates">
          {library.templates.map((template) => {
            const valueCount = template.dimensions.reduce(
              (total, dimension) => total + dimension.values.length,
              0,
            );
            return (
              <li className={styles.template} key={template.id}>
                <details className={styles.disclosure}>
                  <summary>
                    <span className={styles.identity}>
                      <strong className={styles.templateTitle} title={template.name}>
                        {template.name}
                      </strong>
                      <span className={styles.note}>
                        {template.dimensions.length}{" "}
                        {template.dimensions.length === 1 ? "dimension" : "dimensions"} ·{" "}
                        {valueCount} {valueCount === 1 ? "value" : "values"}
                      </span>
                    </span>
                    <ChevronDownIcon className={styles.chevron} />
                  </summary>
                  <div className={styles.templateBody}>
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
                        <Tooltip content={APPLY_NOTE} position="bottom">
                          <Button
                            size="compact"
                            variant="secondary"
                            disabled={disabled}
                            aria-label={`Apply template ${template.name}`}
                            onClick={() => {
                              if (disabled) return;
                              if (onApply(template.dimensions)) {
                                clearErrors();
                                setStatus(`Template “${template.name}” applied.`);
                                setApplied(template.id);
                              } else {
                                setApplied(null);
                              }
                            }}
                          >
                            Apply to project
                          </Button>
                        </Tooltip>
                        {applied === template.id && (
                          <span className={styles.applied} aria-hidden="true">
                            {checkIcon}
                            Applied
                          </span>
                        )}
                        <span className={styles.deleteAction}>
                          <IconButton
                            icon={deleteIcon}
                            tone="danger"
                            tooltip="Delete"
                            disabled={disabled}
                            aria-label={`Delete template ${template.name}`}
                            onClick={() => setDeleting(template.id)}
                          />
                        </span>
                      </div>
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      <form className={styles.saveForm} onSubmit={save}>
        <Input
          label="Save project as template"
          value={name}
          error={saveError}
          disabled={disabled || !!library.error || !canSave}
          placeholder="Template name"
          onChange={(event) => {
            setName(event.target.value);
            setSaveError(null);
          }}
        />
        {canSave ? (
          <Tooltip content="Saves active dimensions and values only." position="top">
            {saveButton}
          </Tooltip>
        ) : (
          saveButton
        )}
      </form>
    </section>
  );
}
