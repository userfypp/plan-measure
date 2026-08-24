import { useState, type FormEvent } from "react";
import { Badge, Button, Input } from "../../components/ui";
import type { ClassificationCatalog } from "../../types/domain";
import styles from "./ClassificationManager.module.css";

export interface ClassificationManagerProps {
  catalog: ClassificationCatalog;
  onCreateDimension: (name: string) => void;
  onRenameDimension: (dimensionId: string, name: string) => void;
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
    if (catalog.dimensions.some((dimension) => dimension.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
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
    if (dimension?.values.some((value) => value.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setValueErrors((current) => ({ ...current, [dimensionId]: "Value names must be unique in this dimension." }));
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

  function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = editName.trim();
    if (!editing || !name) {
      setNameError("Name cannot be empty.");
      return;
    }
    const dimension = catalog.dimensions.find((candidate) => candidate.id === editing.dimensionId);
    const value = editing.type === "value"
      ? dimension?.values.find((candidate) => candidate.id === editing.valueId)
      : null;
    if (!dimension || (editing.type === "value" && !value)) {
      setNameError("This classification is no longer available.");
      return;
    }
    const duplicate = editing.type === "dimension"
      ? catalog.dimensions.some((candidate) => candidate.id !== editing.dimensionId && candidate.name.toLocaleLowerCase() === name.toLocaleLowerCase())
      : dimension.values.some((candidate) => candidate.id !== editing.valueId && candidate.name.toLocaleLowerCase() === name.toLocaleLowerCase());
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
      <header className={styles.header}>
        <div><span className={styles.eyebrow}>Catalog</span><h2>Classifications</h2></div>
        <Badge>{catalog.dimensions.length}</Badge>
      </header>
      <div className={styles.body}>
        <p className={styles.description}>Create reusable values. Classifications never change measurement scales.</p>
        {catalog.dimensions.length === 0 ? (
          <p className={styles.empty}>Create a dimension such as Trade, Status, or Area.</p>
        ) : (
          <ul className={styles.list} aria-label="Classification dimensions">
            {catalog.dimensions.map((dimension) => (
              <li key={dimension.id} className={styles.item}>
                <div className={styles.itemHeader}>
                  <div className={styles.itemText}>
                    <strong>{dimension.name}</strong>
                    <span>{dimension.values.filter((value) => !value.archived).length} active values</span>
                  </div>
                  <Button variant="ghost" size="compact" disabled={disabled} onClick={() => startEditing({ type: "dimension", dimensionId: dimension.id }, dimension.name)}>Rename</Button>
                </div>
                <ul className={styles.valueList} aria-label={`${dimension.name} values`}>
                  {dimension.values.map((value) => (
                    <li key={value.id} className={styles.valueItem}>
                      <span className={styles.valueName}>{value.name}</span>
                      {value.archived ? (
                        <div className={styles.actions}>
                          <Badge variant="neutral">Archived</Badge>
                          <Button variant="ghost" size="compact" disabled={disabled} onClick={() => onRestoreValue(dimension.id, value.id)}>Restore</Button>
                        </div>
                      ) : (
                        <div className={styles.actions}>
                          <Button variant="ghost" size="compact" disabled={disabled} onClick={() => startEditing({ type: "value", dimensionId: dimension.id, valueId: value.id }, value.name)}>Rename</Button>
                          <Button
                            variant="dangerSecondary"
                            size="compact"
                            disabled={disabled}
                            aria-label={`Archive ${value.name}; existing assignments are preserved`}
                            title="Existing measurement assignments will be preserved"
                            onClick={() => onArchiveValue(dimension.id, value.id)}
                          >
                            Archive
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                <form className={styles.inlineForm} onSubmit={(event) => submitValue(event, dimension.id)}>
                  <Input label={`New value for ${dimension.name}`} value={valueNames[dimension.id] ?? ""} error={valueErrors[dimension.id]} disabled={disabled} onChange={(event) => { setValueNames((current) => ({ ...current, [dimension.id]: event.target.value })); setValueErrors((current) => ({ ...current, [dimension.id]: null })); }} />
                  <Button type="submit" disabled={disabled || !(valueNames[dimension.id] ?? "").trim()}>Add value</Button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form className={styles.create} onSubmit={submitDimension}>
          <Input label="New dimension" value={dimensionName} error={createError} disabled={disabled} onChange={(event) => { setDimensionName(event.target.value); setCreateError(null); }} />
          <Button type="submit" disabled={disabled || !dimensionName.trim()}>Add dimension</Button>
        </form>
      </div>
      {editing && (
        <form className={styles.renameOverlay} onSubmit={submitRename} aria-label="Rename classification">
          <Input label={`Rename ${editing.type}`} value={editName} error={nameError} disabled={disabled} autoFocus onChange={(event) => setEditName(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setEditing(null); }} />
          <div className={styles.actions}>
            <Button variant="secondary" size="compact" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" size="compact" disabled={disabled}>Save</Button>
          </div>
        </form>
      )}
    </section>
  );
}
