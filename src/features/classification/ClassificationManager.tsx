import { useState, type FormEvent } from "react";
import { Badge, Button, Input } from "../../components/ui";
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

  return (
    <section className={styles.manager} aria-label="Classification catalog">
      <div className={styles.body}>
        <p className={styles.description}>
          Create reusable values. Classifications never change measurement scales.
        </p>
        {catalog.dimensions.length === 0 ? (
          <p className={styles.empty}>Create a dimension such as Trade, Status, or Area.</p>
        ) : (
          <ul className={styles.list} aria-label="Classification dimensions">
            {catalog.dimensions.map((dimension) => {
              const activeValueCount = dimension.values.filter((value) => !value.archived).length;
              const archivedValueCount = dimension.values.filter((value) => value.archived).length;
              return (
                <li
                  key={dimension.id}
                  className={[styles.item, dimension.archived ? styles.archivedItem : ""]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className={styles.itemHeader}>
                    <div className={styles.itemText}>
                      <strong>{dimension.name}</strong>
                      <span>
                        {activeValueCount} active value{activeValueCount === 1 ? "" : "s"}
                        {archivedValueCount > 0 ? ` · ${archivedValueCount} archived` : ""}
                      </span>
                    </div>
                    {dimension.archived ? (
                      <div className={styles.actions}>
                        <Badge variant="neutral">Archived</Badge>
                        <Button
                          variant="ghost"
                          size="compact"
                          disabled={disabled}
                          onClick={() => onRestoreDimension(dimension.id)}
                        >
                          Restore
                        </Button>
                      </div>
                    ) : (
                      <div className={styles.actions}>
                        <Button
                          variant="ghost"
                          size="compact"
                          disabled={disabled}
                          onClick={() =>
                            startEditing(
                              { type: "dimension", dimensionId: dimension.id },
                              dimension.name,
                            )
                          }
                        >
                          Rename
                        </Button>
                        <Button
                          variant="dangerSecondary"
                          size="compact"
                          disabled={disabled}
                          aria-label={`Archive ${dimension.name}; existing assignments are preserved`}
                          title="Existing measurement assignments will be preserved"
                          onClick={() => archiveDimension(dimension.id)}
                        >
                          Archive
                        </Button>
                      </div>
                    )}
                  </div>
                  <ul className={styles.valueList} aria-label={`${dimension.name} values`}>
                    {dimension.values.map((value) => {
                      const valueActions = dimension.archived ? (
                        value.archived ? (
                          <div className={styles.actions}>
                            <Badge variant="neutral">Archived</Badge>
                          </div>
                        ) : null
                      ) : value.archived ? (
                        <div className={styles.actions}>
                          <Badge variant="neutral">Archived</Badge>
                          <Button
                            variant="ghost"
                            size="compact"
                            disabled={disabled}
                            onClick={() => onRestoreValue(dimension.id, value.id)}
                          >
                            Restore
                          </Button>
                        </div>
                      ) : (
                        <div className={styles.actions}>
                          <Button
                            variant="ghost"
                            size="compact"
                            disabled={disabled}
                            onClick={() =>
                              startEditing(
                                { type: "value", dimensionId: dimension.id, valueId: value.id },
                                value.name,
                              )
                            }
                          >
                            Rename
                          </Button>
                          <Button
                            variant="dangerSecondary"
                            size="compact"
                            disabled={disabled}
                            aria-label={`Archive ${value.name}; existing assignments are preserved`}
                            title="Existing measurement assignments will be preserved"
                            onClick={() => archiveValue(dimension.id, value.id)}
                          >
                            Archive
                          </Button>
                        </div>
                      );
                      return (
                        <li key={value.id} className={styles.valueItem}>
                          <span className={styles.valueName}>{value.name}</span>
                          {valueActions}
                        </li>
                      );
                    })}
                  </ul>
                  {dimension.archived ? (
                    <p className={styles.archivedNote}>
                      Existing measurement assignments are preserved. Restore this dimension to edit
                      or assign it.
                    </p>
                  ) : (
                    <form
                      className={styles.inlineForm}
                      onSubmit={(event) => submitValue(event, dimension.id)}
                    >
                      <Input
                        label={`New value for ${dimension.name}`}
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
                        disabled={disabled || !(valueNames[dimension.id] ?? "").trim()}
                      >
                        Add value
                      </Button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <form className={styles.create} onSubmit={submitDimension}>
          <Input
            label="New dimension"
            value={dimensionName}
            error={createError}
            disabled={disabled}
            onChange={(event) => {
              setDimensionName(event.target.value);
              setCreateError(null);
            }}
          />
          <Button type="submit" disabled={disabled || !dimensionName.trim()}>
            Add dimension
          </Button>
        </form>
      </div>
      {editing && (
        <form
          className={styles.renameOverlay}
          onSubmit={submitRename}
          aria-label="Rename classification"
        >
          <Input
            label={`Rename ${editing.type}`}
            value={editName}
            error={nameError}
            disabled={disabled}
            autoFocus
            onChange={(event) => setEditName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") cancelEditing();
            }}
          />
          <div className={styles.actions}>
            <Button variant="secondary" size="compact" onClick={cancelEditing}>
              Cancel
            </Button>
            <Button type="submit" size="compact" disabled={disabled}>
              Save
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
