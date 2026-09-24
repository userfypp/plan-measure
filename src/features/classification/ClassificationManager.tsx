import { useState, type FormEvent } from "react";
import { AnchoredMenu, Badge, Button, Input } from "../../components/ui";
import type { ClassificationCatalog } from "../../types/domain";
import { classificationNameKey } from "../../utils/classificationNames";
import styles from "./ClassificationManager.module.css";

export interface ClassificationManagerProps {
  catalog: ClassificationCatalog;
  onCreateDimension: (name: string) => void;
  onRenameDimension: (dimensionId: string, name: string) => void;
  onArchiveDimension: (dimensionId: string) => void;
  onRestoreDimension: (dimensionId: string) => void;
  onCreateValue: (dimensionId: string, name: string) => void;
  onRenameValue: (dimensionId: string, valueId: string, name: string) => void;
  onArchiveValue: (dimensionId: string, valueId: string) => void;
  onRestoreValue: (dimensionId: string, valueId: string) => void;
  disabled?: boolean;
}

type EditingTarget =
  | { type: "dimension"; dimensionId: string }
  | { type: "value"; dimensionId: string; valueId: string };

function MoreActionsIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="3" cy="8" r="1" />
      <circle cx="8" cy="8" r="1" />
      <circle cx="13" cy="8" r="1" />
    </svg>
  );
}

export function ClassificationManager({
  catalog,
  onCreateDimension,
  onRenameDimension,
  onArchiveDimension,
  onRestoreDimension,
  onCreateValue,
  onRenameValue,
  onArchiveValue,
  onRestoreValue,
  disabled = false,
}: ClassificationManagerProps) {
  const [dimensionName, setDimensionName] = useState("");
  const [valueNames, setValueNames] = useState<Record<string, string>>({});
  const [createError, setCreateError] = useState<string | null>(null);
  const [valueErrors, setValueErrors] = useState<Record<string, string | null>>({});
  const [editing, setEditing] = useState<EditingTarget | null>(null);
  const [editName, setEditName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  function submitDimension(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = dimensionName.trim();
    if (!name) return;
    if (
      catalog.dimensions.some(
        (dimension) => classificationNameKey(dimension.name) === classificationNameKey(name),
      )
    ) {
      setCreateError("Dimension names must be unique.");
      return;
    }
    onCreateDimension(name);
    setDimensionName("");
    setCreateError(null);
  }

  function submitValue(event: FormEvent<HTMLFormElement>, dimensionId: string) {
    event.preventDefault();
    const name = (valueNames[dimensionId] ?? "").trim();
    if (!name) return;
    const dimension = catalog.dimensions.find((candidate) => candidate.id === dimensionId);
    if (dimension?.archived) {
      setValueErrors((current) => ({
        ...current,
        [dimensionId]: "Restore this dimension before editing it.",
      }));
      return;
    }
    if (
      dimension?.values.some(
        (value) => classificationNameKey(value.name) === classificationNameKey(name),
      )
    ) {
      setValueErrors((current) => ({
        ...current,
        [dimensionId]: "Value names must be unique in this dimension.",
      }));
      return;
    }
    onCreateValue(dimensionId, name);
    setValueNames((current) => ({ ...current, [dimensionId]: "" }));
    setValueErrors((current) => ({ ...current, [dimensionId]: null }));
  }

  function startEditing(target: EditingTarget, currentName: string) {
    setEditing(target);
    setEditName(currentName);
    setNameError(null);
  }

  function cancelEditing() {
    setEditing(null);
    setNameError(null);
  }

  function archiveDimension(dimensionId: string) {
    if (editing?.dimensionId === dimensionId) {
      cancelEditing();
    }
    onArchiveDimension(dimensionId);
  }

  function archiveValue(dimensionId: string, valueId: string) {
    if (
      editing?.type === "value" &&
      editing.dimensionId === dimensionId &&
      editing.valueId === valueId
    ) {
      cancelEditing();
    }
    onArchiveValue(dimensionId, valueId);
  }

  function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = editName.trim();
    if (!editing || !name) {
      setNameError("Name cannot be empty.");
      return;
    }
    const dimension = catalog.dimensions.find((candidate) => candidate.id === editing.dimensionId);
    const value =
      editing.type === "value"
        ? dimension?.values.find((candidate) => candidate.id === editing.valueId)
        : null;
    if (!dimension || (editing.type === "value" && !value)) {
      setNameError("This classification is no longer available.");
      return;
    }
    if (dimension.archived) {
      setNameError("Restore this dimension before editing it.");
      return;
    }
    if (editing.type === "value" && value?.archived) {
      setNameError("Restore this value before editing it.");
      return;
    }
    const duplicate =
      editing.type === "dimension"
        ? catalog.dimensions.some(
            (candidate) =>
              candidate.id !== editing.dimensionId &&
              classificationNameKey(candidate.name) === classificationNameKey(name),
          )
        : dimension.values.some(
            (candidate) =>
              candidate.id !== editing.valueId &&
              classificationNameKey(candidate.name) === classificationNameKey(name),
          );
    if (duplicate) {
      setNameError(`${editing.type === "dimension" ? "Dimension" : "Value"} names must be unique.`);
      return;
    }
    if (editing.type === "dimension") onRenameDimension(editing.dimensionId, name);
    else onRenameValue(editing.dimensionId, editing.valueId, name);
    setEditing(null);
    setNameError(null);
  }

  function renderRenameForm(className: string | undefined) {
    if (!editing) return null;
    return (
      <form
        className={className}
        onSubmit={submitRename}
        aria-label="Rename classification"
      >
        <Input
          label={<span className={styles.inlineLabel}>Rename {editing.type}</span>}
          className={styles.compactInput}
          placeholder="New name"
          value={editName}
          error={nameError}
          disabled={disabled}
          autoFocus
          onChange={(event) => setEditName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") cancelEditing();
          }}
        />
        <div className={styles.renameActions}>
          <Button variant="ghost" size="compact" onClick={cancelEditing}>
            Cancel
          </Button>
          <Button type="submit" variant="secondary" size="compact" disabled={disabled}>
            Save
          </Button>
        </div>
      </form>
    );
  }

  return (
    <section className={styles.manager} aria-label="Classification catalog">
      <div className={styles.body}>
        {catalog.dimensions.length > 0 && (
          <ul className={styles.list} aria-label="Classification dimensions">
            {catalog.dimensions.map((dimension) => {
              const editingDimension =
                editing?.type === "dimension" && editing.dimensionId === dimension.id;
              return (
                <li key={dimension.id} className={styles.item}>
                  <div className={styles.itemHeader}>
                    {editingDimension ? (
                      renderRenameForm(styles.renameForm)
                    ) : (
                      <>
                        <h3 className={styles.itemTitle} title={dimension.name}>
                          {dimension.name}
                        </h3>
                        {dimension.archived ? (
                          <div className={styles.actions}>
                            <Badge variant="neutral">Archived</Badge>
                            <Button
                              variant="secondary"
                              size="compact"
                              className={styles.restoreAction}
                              disabled={disabled}
                              aria-label={`Restore dimension ${dimension.name}`}
                              onClick={() => onRestoreDimension(dimension.id)}
                            >
                              Restore
                            </Button>
                          </div>
                        ) : (
                          <AnchoredMenu
                            trigger={<MoreActionsIcon />}
                            triggerProps={{
                              className: styles.dimensionMenuTrigger,
                              "aria-label": `Actions for dimension ${dimension.name}`,
                              disabled,
                            }}
                            label={`Actions for dimension ${dimension.name}`}
                            showMarkerColumn={false}
                            items={[
                              {
                                id: "rename",
                                label: "Rename",
                                onSelect: () =>
                                  startEditing(
                                    { type: "dimension", dimensionId: dimension.id },
                                    dimension.name,
                                  ),
                              },
                              {
                                id: "archive",
                                label: "Archive (assignments preserved)",
                                onSelect: () => archiveDimension(dimension.id),
                              },
                            ]}
                          />
                        )}
                      </>
                    )}
                  </div>
                  <div className={styles.valueSection}>
                    <ul className={styles.valueList} aria-label={`${dimension.name} values`}>
                      {dimension.values.map((value) => {
                        const editingValue =
                          editing?.type === "value" &&
                          editing.dimensionId === dimension.id &&
                          editing.valueId === value.id;
                        return (
                          <li key={value.id} className={styles.valueItem}>
                            {editingValue ? (
                              renderRenameForm(styles.valueRenameForm)
                            ) : dimension.archived ? (
                              <span className={styles.readOnlyValue} title={value.name}>
                                <span className={styles.valueName}>{value.name}</span>
                                {value.archived && <Badge variant="neutral">Archived</Badge>}
                              </span>
                            ) : (
                              <AnchoredMenu
                                trigger={
                                  <span className={styles.valueChipContent}>
                                    <span className={styles.valueName} title={value.name}>
                                      {value.name}
                                    </span>
                                    {value.archived && <Badge variant="neutral">Archived</Badge>}
                                    <MoreActionsIcon />
                                  </span>
                                }
                                triggerProps={{
                                  className: [
                                    styles.valueChipTrigger,
                                    value.archived ? styles.archivedValueChip : "",
                                  ]
                                    .filter(Boolean)
                                    .join(" "),
                                  "aria-label": `Actions for ${value.archived ? "archived " : ""}value ${value.name}`,
                                  disabled,
                                }}
                                label={`Actions for ${value.archived ? "archived " : ""}value ${value.name}`}
                                showMarkerColumn={false}
                                items={
                                  value.archived
                                    ? [
                                        {
                                          id: "restore",
                                          label: "Restore",
                                          onSelect: () => onRestoreValue(dimension.id, value.id),
                                        },
                                      ]
                                    : [
                                        {
                                          id: "rename",
                                          label: "Rename",
                                          onSelect: () =>
                                            startEditing(
                                              {
                                                type: "value",
                                                dimensionId: dimension.id,
                                                valueId: value.id,
                                              },
                                              value.name,
                                            ),
                                        },
                                        {
                                          id: "archive",
                                          label: "Archive (assignments preserved)",
                                          onSelect: () => archiveValue(dimension.id, value.id),
                                        },
                                      ]
                                }
                              />
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {dimension.archived ? (
                      <p className={styles.archivedNote}>
                        Assignments are preserved. Restore to edit or assign.
                      </p>
                    ) : (
                      <form
                        className={styles.inlineForm}
                        onSubmit={(event) => submitValue(event, dimension.id)}
                      >
                        <Input
                          label={
                            <span
                              className={styles.inlineLabel}
                              title={`New value for ${dimension.name}`}
                            >
                              New value for {dimension.name}
                            </span>
                          }
                          className={styles.compactInput}
                          placeholder="New value…"
                          value={valueNames[dimension.id] ?? ""}
                          error={valueErrors[dimension.id]}
                          disabled={disabled}
                          onChange={(event) => {
                            setValueNames((current) => ({
                              ...current,
                              [dimension.id]: event.target.value,
                            }));
                            setValueErrors((current) => ({ ...current, [dimension.id]: null }));
                          }}
                        />
                        <Button
                          type="submit"
                          variant="secondary"
                          size="compact"
                          aria-label={`Add value to ${dimension.name}`}
                          disabled={disabled || !(valueNames[dimension.id] ?? "").trim()}
                        >
                          Add
                        </Button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <form className={styles.create} onSubmit={submitDimension}>
          <Input
            label="New dimension"
            className={styles.compactInput}
            placeholder="Dimension name"
            value={dimensionName}
            error={createError}
            disabled={disabled}
            onChange={(event) => {
              setDimensionName(event.target.value);
              setCreateError(null);
            }}
          />
          <Button
            type="submit"
            variant="secondary"
            size="compact"
            aria-label="Add dimension"
            disabled={disabled || !dimensionName.trim()}
          >
            Add
          </Button>
        </form>
      </div>
    </section>
  );
}
