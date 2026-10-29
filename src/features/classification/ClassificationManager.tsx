import { useState, type FormEvent } from "react";
import {
  AnchoredMenu,
  Badge,
  CloseIcon,
  IconButton,
  InlineField,
  PlusIcon,
  RestoreIcon,
  SaveIcon,
} from "../../components/ui";
import type { ClassificationCatalog } from "../../types/domain";
import { classificationNameKey } from "../../utils/classificationNames";
import styles from "./ClassificationManager.module.css";

export interface ClassificationManagerProps {
  catalog: ClassificationCatalog;
  onCreateDimension: (name: string) => void;
  onRenameDimension: (dimensionId: string, name: string) => void;
  onDeleteDimension: (dimensionId: string) => void;
  onArchiveDimension: (dimensionId: string) => void;
  onRestoreDimension: (dimensionId: string) => void;
  onCreateValue: (dimensionId: string, name: string) => void;
  onRenameValue: (dimensionId: string, valueId: string, name: string) => void;
  onDeleteValue: (dimensionId: string, valueId: string) => void;
  onArchiveValue: (dimensionId: string, valueId: string) => void;
  onRestoreValue: (dimensionId: string, valueId: string) => void;
  disabled?: boolean;
}

type EditingTarget =
  | { type: "dimension"; dimensionId: string }
  | { type: "value"; dimensionId: string; valueId: string };

function MoreActionsIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="3.75" cy="10" r="1.25" />
      <circle cx="10" cy="10" r="1.25" />
      <circle cx="16.25" cy="10" r="1.25" />
    </svg>
  );
}

export function ClassificationManager({
  catalog,
  onCreateDimension,
  onRenameDimension,
  onDeleteDimension,
  onArchiveDimension,
  onRestoreDimension,
  onCreateValue,
  onRenameValue,
  onDeleteValue,
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

  function renderRenameForm() {
    if (!editing) return null;
    return (
      <InlineField
        formLabel="Rename classification"
        aria-label={`Rename ${editing.type}`}
        placeholder="New name"
        value={editName}
        error={nameError}
        disabled={disabled}
        autoFocus
        onChange={(event) => setEditName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") cancelEditing();
        }}
        onSubmit={submitRename}
        actions={
          <>
            <IconButton
              icon={<CloseIcon />}
              aria-label="Cancel"
              tooltip="Cancel"
              onClick={cancelEditing}
            />
            <IconButton
              type="submit"
              tone="primary"
              icon={<SaveIcon />}
              aria-label="Save"
              tooltip="Save"
              disabled={disabled}
            />
          </>
        }
      />
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
                  {editingDimension ? (
                    renderRenameForm()
                  ) : (
                    <div className={styles.itemHeader}>
                      <h3 className={styles.itemTitle} title={dimension.name}>
                        {dimension.name}
                      </h3>
                      {dimension.archived ? (
                        <div className={styles.actions}>
                          <Badge variant="neutral">Archived</Badge>
                          <IconButton
                            icon={<RestoreIcon />}
                            tooltip="Restore"
                            disabled={disabled}
                            aria-label={`Restore dimension ${dimension.name}`}
                            onClick={() => onRestoreDimension(dimension.id)}
                          />
                          <AnchoredMenu
                            trigger={<MoreActionsIcon />}
                            triggerProps={{
                              className: styles.dimensionMenuTrigger,
                              "aria-label": `Actions for dimension ${dimension.name}`,
                              disabled,
                            }}
                            label={`Actions for dimension ${dimension.name}`}
                            items={[
                              {
                                id: "delete",
                                label: "Delete",
                                onSelect: () => onDeleteDimension(dimension.id),
                              },
                            ]}
                          />
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
                            {
                              id: "delete",
                              label: "Delete",
                              onSelect: () => onDeleteDimension(dimension.id),
                            },
                          ]}
                        />
                      )}
                    </div>
                  )}
                  <div className={styles.valueSection}>
                    <ul className={styles.valueList} aria-label={`${dimension.name} values`}>
                      {dimension.values.map((value) => {
                        const editingValue =
                          editing?.type === "value" &&
                          editing.dimensionId === dimension.id &&
                          editing.valueId === value.id;
                        return (
                          <li
                            key={value.id}
                            className={[
                              styles.valueItem,
                              editingValue ? styles.valueItemEditing : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          >
                            {editingValue ? (
                              renderRenameForm()
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
                                items={[
                                  ...(dimension.archived
                                    ? []
                                    : value.archived
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
                                        ]),
                                  {
                                    id: "delete",
                                    label: "Delete",
                                    onSelect: () => onDeleteValue(dimension.id, value.id),
                                  },
                                ]}
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
                      <InlineField
                        aria-label={`New value for ${dimension.name}`}
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
                        onSubmit={(event) => submitValue(event, dimension.id)}
                        actions={
                          <IconButton
                            type="submit"
                            icon={<PlusIcon />}
                            aria-label={`Add value to ${dimension.name}`}
                            tooltip="Add value"
                            disabled={disabled || !(valueNames[dimension.id] ?? "").trim()}
                          />
                        }
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <InlineField
          variant="row"
          label="New dimension"
          placeholder="Dimension name"
          value={dimensionName}
          error={createError}
          disabled={disabled}
          onChange={(event) => {
            setDimensionName(event.target.value);
            setCreateError(null);
          }}
          onSubmit={submitDimension}
          actions={
            <IconButton
              type="submit"
              icon={<PlusIcon />}
              aria-label="Add dimension"
              tooltip="Add dimension"
              disabled={disabled || !dimensionName.trim()}
            />
          }
        />
      </div>
    </section>
  );
}
