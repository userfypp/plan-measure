import { useState, type FormEvent } from "react";
import { Button, Input } from "../../components/ui";
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

function DisclosureChevron() {
  return (
    <svg className={styles.chevron} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="m6.5 8 3.5 3.5L13.5 8" />
    </svg>
  );
}

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
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const dimensions = templateDimensions(catalog);
  const canSave = validTemplateDimensions(dimensions);

  function persist(templates: ClassificationTemplate[], message: string) {
    const latest = readClassificationTemplates();
    if (latest.error || JSON.stringify(latest.templates) !== JSON.stringify(library.templates)) {
      setLibrary(latest);
      setError(
        latest.error
          ? null
          : "Saved templates changed in another window. Review the updated library and try again.",
      );
      setStatus("");
      setDeleting(null);
      return false;
    }
    const failure = writeClassificationTemplates(templates);
    setError(failure);
    if (failure) return false;
    setLibrary({ templates, error: null });
    setStatus(message);
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
      setError("Template names must be unique. Choose another name.");
      return;
    }
    if (
      persist(
        [...library.templates, { id: crypto.randomUUID(), name: trimmed, dimensions }],
        `Template “${trimmed}” saved.`,
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
      {error && (
        <p className={styles.feedback} role="alert">
          {error}
        </p>
      )}
      <p className={status ? styles.feedback : styles.visuallyHidden} role="status">
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
      <ul className={styles.templates} aria-label="Saved classification templates">
        {library.templates.map((template) => {
          const valueCount = template.dimensions.reduce(
            (total, dimension) => total + dimension.values.length,
            0,
          );
          return (
            <li className={styles.template} key={template.id}>
              <details className={styles.disclosure}>
                <summary className={styles.templateSummary}>
                  <span className={styles.identity}>
                    <strong title={template.name}>{template.name}</strong>
                    <span className={styles.note}>
                      {template.dimensions.length}{" "}
                      {template.dimensions.length === 1 ? "dimension" : "dimensions"} · {valueCount}{" "}
                      {valueCount === 1 ? "value" : "values"}
                    </span>
                  </span>
                  <DisclosureChevron />
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
                    <div className={styles.templateActions}>
                      <p className={styles.note}>
                        Delete this template? Applied classifications are preserved.
                      </p>
                      <Button size="compact" variant="ghost" onClick={() => setDeleting(null)}>
                        Cancel
                      </Button>
                      <Button
                        size="compact"
                        variant="dangerSecondary"
                        disabled={disabled}
                        onClick={() => {
                          if (
                            persist(
                              library.templates.filter((item) => item.id !== template.id),
                              `Template “${template.name}” deleted.`,
                            )
                          )
                            setDeleting(null);
                        }}
                      >
                        Delete template
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className={styles.templateActions}>
                        <Button
                          size="compact"
                          variant="secondary"
                          disabled={disabled}
                          aria-label={`Apply template ${template.name}`}
                          onClick={() => {
                            if (disabled) return;
                            if (onApply(template.dimensions)) {
                              setError(null);
                              setStatus(`Template “${template.name}” applied.`);
                            }
                          }}
                        >
                          Apply to project
                        </Button>
                        <Button
                          size="compact"
                          variant="ghost"
                          disabled={disabled}
                          aria-label={`Delete template ${template.name}`}
                          onClick={() => setDeleting(template.id)}
                        >
                          Delete
                        </Button>
                      </div>
                      <p className={styles.note}>
                        Adds missing entries and keeps existing assignments. Restore matching
                        archived entries first.
                      </p>
                    </>
                  )}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
      <details className={styles.disclosure}>
        <summary className={styles.saveSummary}>
          <span>Save project as template</span>
          <DisclosureChevron />
        </summary>
        <form className={styles.saveForm} onSubmit={save}>
          <p className={styles.note}>Active dimensions and values only.</p>
          {!canSave && (
            <p className={styles.note}>
              Create an active dimension with unique names before saving.
            </p>
          )}
          <Input
            label="Template name"
            className={styles.compactInput}
            value={name}
            disabled={disabled || !!library.error || !canSave}
            placeholder="e.g. Residential finishes"
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
          />
          <Button
            type="submit"
            size="compact"
            variant="secondary"
            disabled={disabled || !!library.error || !canSave || !name.trim()}
          >
            Save template
          </Button>
        </form>
      </details>
    </section>
  );
}
