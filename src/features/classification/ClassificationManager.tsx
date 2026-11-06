import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AnchoredMenu,
  Badge,
  CloseIcon,
  Disclosure,
  IconButton,
  InlineField,
  PlusIcon,
  SaveIcon,
  Tooltip,
} from "../../components/ui";
import type {
  ClassificationCatalog,
  ClassificationDimension,
  ClassificationValueDerivation,
  ClassificationValuePrice,
  ClassificationValueRates,
  MeasurementDecimalPlaces,
  MeasurementDisplayUnit,
} from "../../types/domain";
import { useNumberFormatKey } from "../../utils/appPreferences";
import { classificationNameKey, classificationSearchKey } from "../../utils/classificationNames";
import { ratesByValueId } from "../../utils/classificationRates";
import { DEFAULT_MEASUREMENT_DECIMAL_PLACES, resolveLinearUnit } from "../../utils/format";
import { ClassificationValueRatesDialog } from "./ClassificationValueRatesDialog";
import { ratesFullSummary, ratesShortSummary } from "./classificationRatesSummary";
import styles from "./ClassificationManager.module.css";

const count = (total: number, one: string, many = `${one}s`) =>
  `${total} ${total === 1 ? one : many}`;

const NO_FOLDS: ReadonlySet<string> = new Set();

type RowActionId = "restore" | "rename" | "archive" | "delete";

interface RowAction {
  id: RowActionId;
  label: string;
  onSelect: () => void;
}

/**
 * The next active value in catalog order, crossing into the next dimension; archived values and
 * dimensions are skipped. Null after the last one.
 */
function nextRatesTarget(
  catalog: ClassificationCatalog,
  current: { dimensionId: string; valueId: string },
): { dimensionId: string; valueId: string; label: string } | null {
  const active = catalog.dimensions
    .filter((dimension) => !dimension.archived)
    .flatMap((dimension) =>
      dimension.values
        .filter((value) => !value.archived)
        .map((value) => ({
          dimensionId: dimension.id,
          valueId: value.id,
          label: `${dimension.name} · ${value.name}`,
        })),
    );
  const index = active.findIndex((entry) => entry.valueId === current.valueId);
  return index >= 0 ? (active[index + 1] ?? null) : null;
}

/** `3 values · 1 derived · 2 priced · 1 archived`, leaving out what is zero. */
function dimensionSubtitle(
  dimension: ClassificationDimension,
  rates: ReadonlyMap<string, ClassificationValueRates>,
): string {
  const values =
    dimension.values.length > 0 ? count(dimension.values.length, "value") : "No values";
  if (dimension.archived) return `Archived · ${values}`;
  let derived = 0;
  let priced = 0;
  let archived = 0;
  for (const value of dimension.values) {
    if (value.archived) {
      archived += 1;
      continue;
    }
    const valueRates = rates.get(value.id);
    if (valueRates?.derivation) derived += 1;
    if (valueRates?.price) priced += 1;
  }
  return [
    values,
    derived > 0 && `${derived} derived`,
    priced > 0 && `${priced} priced`,
    archived > 0 && `${archived} archived`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export interface ClassificationManagerProps {
  catalog: ClassificationCatalog;
  /** The workspace header's search: dimensions and values are filtered by it. */
  search?: string;
  /** Lets the manager clear a search that would hide what was just created. */
  onSearchChange?: (search: string) => void;
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
  rates?: readonly ClassificationValueRates[];
  currency?: string | null;
  displayUnit?: MeasurementDisplayUnit;
  decimalPlaces?: MeasurementDecimalPlaces;
  /** Without it the quantity and price dialog is not offered. */
  onSetValueRates?: (
    valueId: string,
    derivation: ClassificationValueDerivation | null,
    price: ClassificationValuePrice | null,
    currency: string | null,
  ) => boolean;
  disabled?: boolean;
}

type EditingTarget =
  | { type: "dimension"; dimensionId: string }
  | { type: "value"; dimensionId: string; valueId: string };

const NO_RATES: readonly ClassificationValueRates[] = [];

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
  search = "",
  onSearchChange,
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
  rates = NO_RATES,
  currency = null,
  displayUnit = "m",
  decimalPlaces = DEFAULT_MEASUREMENT_DECIMAL_PLACES,
  onSetValueRates,
  disabled = false,
}: ClassificationManagerProps) {
  const [dimensionName, setDimensionName] = useState("");
  const [valueNames, setValueNames] = useState<Record<string, string>>({});
  const [createError, setCreateError] = useState<string | null>(null);
  const [valueErrors, setValueErrors] = useState<Record<string, string | null>>({});
  const [editing, setEditing] = useState<EditingTarget | null>(null);
  const [editName, setEditName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [ratesTarget, setRatesTarget] = useState<{ dimensionId: string; valueId: string } | null>(
    null,
  );
  // Dimensions start closed; this holds the ones the user opened.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(NO_FOLDS);
  // Folds made while searching live apart, so the user's own fold state returns when it is cleared.
  const [searchFolds, setSearchFolds] = useState<ReadonlySet<string>>(NO_FOLDS);
  const [foldedFor, setFoldedFor] = useState("");
  // The name of a dimension just created, to open it once it reaches the catalog.
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const ratesDimension = catalog.dimensions.find((item) => item.id === ratesTarget?.dimensionId);
  const ratesValue = ratesDimension?.values.find((item) => item.id === ratesTarget?.valueId);
  const nextRates = ratesTarget ? nextRatesTarget(catalog, ratesTarget) : null;
  // An empty catalog has nothing to filter.
  const searchTerm = catalog.dimensions.length > 0 ? classificationSearchKey(search).trim() : "";
  if (foldedFor !== searchTerm) {
    // Every query starts with its matches open.
    setFoldedFor(searchTerm);
    setSearchFolds(NO_FOLDS);
  }
  const createdDimension =
    createdKey === null
      ? undefined
      : catalog.dimensions.find((item) => classificationNameKey(item.name) === createdKey);
  if (createdDimension) {
    setCreatedKey(null);
    setExpanded((current) => new Set(current).add(createdDimension.id));
  }
  const visibleDimensions = useMemo(
    () =>
      catalog.dimensions.flatMap((dimension) => {
        if (!searchTerm) return [{ dimension, values: dimension.values }];
        // A dimension found by its name shows all its values; otherwise only the values found.
        if (classificationSearchKey(dimension.name).includes(searchTerm)) {
          return [{ dimension, values: dimension.values }];
        }
        const values = dimension.values.filter((value) =>
          classificationSearchKey(value.name).includes(searchTerm),
        );
        return values.length > 0 ? [{ dimension, values }] : [];
      }),
    [catalog, searchTerm],
  );
  const isOpen = (dimensionId: string) =>
    searchTerm ? !searchFolds.has(dimensionId) : expanded.has(dimensionId);
  const managerRef = useRef<HTMLElement>(null);
  const summaryIdBase = useId();
  const numberFormatKey = useNumberFormatKey();
  const unit = resolveLinearUnit(displayUnit);
  const rateSummaries = useMemo(() => {
    const context = { unit, decimalPlaces, currency };
    const summaries = new Map<string, { short: string; full: string }>();
    for (const entry of rates) {
      const short = ratesShortSummary(entry, context);
      const full = ratesFullSummary(entry, context);
      if (short && full) summaries.set(entry.valueId, { short, full });
    }
    return summaries;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- separators are read by the formatters
  }, [rates, currency, unit, decimalPlaces, numberFormatKey]);
  const dimensionSubtitles = useMemo(() => {
    const byValueId = ratesByValueId(rates);
    return new Map(
      catalog.dimensions.map((dimension) => [
        dimension.id,
        dimensionSubtitle(dimension, byValueId),
      ]),
    );
  }, [catalog, rates]);

  function closeRatesDialog() {
    const valueId = ratesTarget?.valueId;
    setRatesTarget(null);
    // The dialog hands the focus back to whatever it was before; the edited row wins.
    if (!valueId) return;
    window.requestAnimationFrame(() => {
      const rows = managerRef.current?.querySelectorAll<HTMLElement>("[data-value-id]");
      Array.from(rows ?? [])
        .find((row) => row.dataset.valueId === valueId)
        ?.focus({ preventScroll: true });
    });
  }

  function openNextRates() {
    if (!nextRates) return;
    // Its row may sit in a folded dimension; open it so the focus can return there on close.
    setDimensionOpen(nextRates.dimensionId, true);
    setRatesTarget({ dimensionId: nextRates.dimensionId, valueId: nextRates.valueId });
  }

  function setDimensionOpen(dimensionId: string, open: boolean) {
    const update = (current: ReadonlySet<string>, add: boolean) => {
      const next = new Set(current);
      if (add) next.add(dimensionId);
      else next.delete(dimensionId);
      return next;
    };
    // Searching folds what is open; otherwise the set holds what the user opened.
    if (searchTerm) setSearchFolds((current) => update(current, !open));
    else setExpanded((current) => update(current, open));
  }

  /** A new name the search would hide clears it, so the item just created stays in view. */
  function revealCreated(...names: string[]) {
    if (searchTerm && !names.some((name) => classificationSearchKey(name).includes(searchTerm)))
      onSearchChange?.("");
  }

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
    setCreatedKey(classificationNameKey(name));
    revealCreated(name);
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
    revealCreated(name, dimension?.name ?? "");
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

  function renderValueRow(
    dimension: ClassificationDimension,
    value: ClassificationDimension["values"][number],
  ) {
    const summary = rateSummaries.get(value.id);
    const summaryId = `${summaryIdBase}-${value.id}`;
    const actionsLabel = `Actions for ${value.archived ? "archived " : ""}value ${value.name}`;
    const openable = Boolean(onSetValueRates) && !dimension.archived && !value.archived;
    const label = value.archived ? (
      <>
        <span className={styles.valueName} title={value.name}>
          {value.name}
        </span>
        <Badge variant="neutral">Archived</Badge>
      </>
    ) : (
      <span className={styles.valueText}>
        <span className={styles.valueName} title={value.name}>
          {value.name}
        </span>
        {summary && <span className={styles.valueSummary}>{summary.short}</span>}
      </span>
    );
    const valueActions: RowAction[] = [
      ...(dimension.archived
        ? []
        : value.archived
          ? [
              {
                id: "restore" as const,
                label: "Restore",
                onSelect: () => onRestoreValue(dimension.id, value.id),
              },
            ]
          : [
              {
                id: "rename" as const,
                label: "Rename",
                onSelect: () =>
                  startEditing(
                    { type: "value", dimensionId: dimension.id, valueId: value.id },
                    value.name,
                  ),
              },
              {
                id: "archive" as const,
                label: "Archive (assignments preserved)",
                onSelect: () => archiveValue(dimension.id, value.id),
              },
            ]),
      {
        id: "delete" as const,
        label: "Delete",
        onSelect: () => onDeleteValue(dimension.id, value.id),
      },
    ];
    const openButton = (
      <button
        type="button"
        className={styles.valueOpen}
        data-value-id={value.id}
        aria-label={`Quantity and price for value ${value.name}`}
        aria-describedby={summary ? summaryId : undefined}
        disabled={disabled}
        onClick={() => setRatesTarget({ dimensionId: dimension.id, valueId: value.id })}
      >
        {label}
      </button>
    );
    return (
      <div className={styles.valueRow}>
        {openable ? (
          <>
            <Tooltip
              content={summary?.full}
              position="bottom"
              describeTrigger={false}
              suppressed={!summary}
            >
              {openButton}
            </Tooltip>
            {summary && (
              <span id={summaryId} className={styles.visuallyHidden}>
                {summary.full}
              </span>
            )}
          </>
        ) : (
          <div
            className={[styles.valueStatic, value.archived ? styles.valueArchived : ""]
              .filter(Boolean)
              .join(" ")}
          >
            {label}
          </div>
        )}
        <div className={styles.valueActions}>
          <AnchoredMenu
            trigger={<MoreActionsIcon />}
            triggerProps={{
              className: styles.menuTrigger,
              "aria-label": actionsLabel,
              disabled,
            }}
            label={actionsLabel}
            items={valueActions}
          />
        </div>
      </div>
    );
  }

  function renderDimensionActions(dimension: ClassificationDimension) {
    const label = `Actions for dimension ${dimension.name}`;
    const items: RowAction[] = dimension.archived
      ? [
          {
            id: "restore",
            label: "Restore",
            onSelect: () => onRestoreDimension(dimension.id),
          },
          { id: "delete", label: "Delete", onSelect: () => onDeleteDimension(dimension.id) },
        ]
      : [
          {
            id: "rename",
            label: "Rename",
            onSelect: () =>
              startEditing({ type: "dimension", dimensionId: dimension.id }, dimension.name),
          },
          {
            id: "archive",
            label: "Archive (assignments preserved)",
            onSelect: () => archiveDimension(dimension.id),
          },
          { id: "delete", label: "Delete", onSelect: () => onDeleteDimension(dimension.id) },
        ];
    return (
      <AnchoredMenu
        trigger={<MoreActionsIcon />}
        triggerProps={{ className: styles.menuTrigger, "aria-label": label, disabled }}
        label={label}
        items={items}
      />
    );
  }

  return (
    <section ref={managerRef} className={styles.manager} aria-label="Classification catalog">
      <div className={styles.body}>
        {searchTerm && visibleDimensions.length === 0 && (
          <p className={styles.noMatches} role="status">
            No classification matches
          </p>
        )}
        {visibleDimensions.length > 0 && (
          <ul className={styles.list} aria-label="Classification dimensions">
            {visibleDimensions.map(({ dimension, values }) => {
              const editingDimension =
                editing?.type === "dimension" && editing.dimensionId === dimension.id;
              return (
                <li key={dimension.id} className={styles.item}>
                  {editingDimension ? (
                    renderRenameForm()
                  ) : (
                    <Disclosure
                      title={dimension.name}
                      subtitle={dimensionSubtitles.get(dimension.id)}
                      actions={renderDimensionActions(dimension)}
                      open={isOpen(dimension.id)}
                      onOpenChange={(open) => setDimensionOpen(dimension.id, open)}
                    >
                      {values.length > 0 && (
                        <ul className={styles.valueList} aria-label={`${dimension.name} values`}>
                          {values.map((value) => {
                            const editingValue =
                              editing?.type === "value" &&
                              editing.dimensionId === dimension.id &&
                              editing.valueId === value.id;
                            return (
                              <li key={value.id}>
                                {editingValue
                                  ? renderRenameForm()
                                  : renderValueRow(dimension, value)}
                              </li>
                            );
                          })}
                        </ul>
                      )}
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
                    </Disclosure>
                  )}
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
      {ratesDimension && ratesValue && onSetValueRates && (
        <ClassificationValueRatesDialog
          valueId={ratesValue.id}
          dimensionName={ratesDimension.name}
          valueName={ratesValue.name}
          rates={ratesByValueId(rates).get(ratesValue.id)}
          displayUnit={displayUnit}
          currency={currency}
          onSave={(derivation, price, newCurrency) =>
            onSetValueRates(ratesValue.id, derivation, price, newCurrency)
          }
          onClose={closeRatesDialog}
          next={nextRates ? { label: nextRates.label } : undefined}
          onNext={nextRates ? openNextRates : undefined}
        />
      )}
    </section>
  );
}
