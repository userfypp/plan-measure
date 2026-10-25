import { useState, type FormEvent } from "react";
import {
  Button,
  CheckIcon,
  Disclosure,
  IconButton,
  ImportIcon,
  InlineField,
  SaveIcon,
  TrashIcon,
} from "../../components/ui";
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

const APPLY_NOTE = "Apply to project: adds missing entries and keeps existing assignments.";
const SAVE_NOTE = "Save as template: active dimensions and values only.";

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
    </section>
  );
}
