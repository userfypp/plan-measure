import {
  Fragment,
  memo,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  Button,
  CloseIcon,
  IconButton,
  Input,
  Popover,
  PlusIcon,
  RestoreIcon,
  Select,
  type SelectOption,
} from "../../components/ui";
import {
  CATALOG,
  CATALOG_BY_ID,
  FIXED_KEYS,
  FIXED_KEYS_GROUP,
  SHORTCUT_GROUPS,
  buildSearchText,
  type ActionCatalogEntry,
} from "../../features/shortcuts/catalog";
import {
  assignBinding,
  classifyCombo,
  clearBinding,
  findConflict,
  resetAction,
  resetAll,
} from "../../features/shortcuts/conflicts";
import {
  PRESETS,
  detectPreset,
  effectiveBindings,
  presetBindings,
} from "../../features/shortcuts/presets";
import { getAppPreferences, setAppPreference, useAppPreferences } from "../../utils/appPreferences";
import {
  PRESET_IDS,
  eventToCombo,
  type ActionId,
  type PresetId,
} from "../../utils/shortcuts/bindings";
import { formatBinding, type ResolvedBindings } from "../../utils/shortcuts/store";
import styles from "./ShortcutsSettings.module.css";

type Slot = 0 | 1;
type PresetChoice = PresetId | "custom";

interface CaptureTarget {
  id: ActionId;
  slot: Slot;
}

const PRESET_OPTIONS: readonly SelectOption<PresetChoice>[] = PRESET_IDS.map((id) => ({
  value: id,
  label: PRESETS[id].label,
}));

/** "Custom" is only ever the current state, never something to pick. */
const PRESET_OPTIONS_WITH_CUSTOM: readonly SelectOption<PresetChoice>[] = [
  ...PRESET_OPTIONS,
  { value: "custom", label: "Custom", disabled: true },
];

const GROUPS = SHORTCUT_GROUPS.map((group) => ({
  group,
  entries: CATALOG.filter((entry) => entry.group === group),
}));

const FIXED_SEARCH_TEXT = new Map(
  FIXED_KEYS.map((row) => [
    row.id,
    `${buildSearchText(row.label, FIXED_KEYS_GROUP, row.keys)} ${row.description.toLowerCase()}`,
  ]),
);

function sameCombos(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((combo, index) => combo === b[index]);
}

function keysText(combos: readonly string[]): string {
  return combos.map((combo) => formatBinding(combo)).join(" or ");
}

/** What an action uses now, for the live region. */
function usesText(id: ActionId, effective: ResolvedBindings): string {
  const label = CATALOG_BY_ID[id].label;
  const combos = effective[id];
  return combos.length > 0 ? `${label} now uses ${keysText(combos)}.` : `${label} has no shortcut.`;
}

function searchTextOf(entry: ActionCatalogEntry, combos: readonly string[]): string {
  const keys = combos.map((combo) => formatBinding(combo));
  return `${buildSearchText(entry.label, entry.group, keys)} ${entry.description.toLowerCase()}`;
}

/** Every word of the query must appear somewhere in the row's text. */
function matchesQuery(text: string, words: readonly string[]): boolean {
  return words.every((word) => text.includes(word));
}

type CaptureStatus =
  | { kind: "listening" }
  | { kind: "rejected"; combo: string; reason: string }
  | { kind: "conflict"; combo: string; owner: ActionId }
  | { kind: "warn"; combo: string; reason: string };

interface ShortcutCaptureProps {
  entry: ActionCatalogEntry;
  /** The key now in the slot, if any. */
  current: string | undefined;
  onApply: (combo: string, reassign: boolean) => void;
  onClear: () => void;
  onClose: () => void;
}

/**
 * The popover body that listens for the next key. It swallows every key but Tab,
 * Escape and the Enter or Space that press its own buttons, so no global shortcut
 * fires while a key is being chosen.
 */
function ShortcutCapture({ entry, current, onApply, onClear, onClose }: ShortcutCaptureProps) {
  const [status, setStatus] = useState<CaptureStatus>({ kind: "listening" });
  const surfaceRef = useRef<HTMLDivElement>(null);

  function listenWith(next: CaptureStatus) {
    setStatus(next);
    surfaceRef.current?.focus({ preventScroll: true });
  }

  function submit(combo: string, reassign: boolean) {
    onApply(combo, reassign);
    const classification = classifyCombo(combo);
    if (classification.kind === "warn") {
      listenWith({ kind: "warn", combo, reason: classification.reason });
    } else {
      onClose();
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const { key, target } = event;
    if (key === "Tab" || key === "Escape") return;
    if ((key === "Enter" || key === " ") && target instanceof Element && target.closest("button")) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat || event.nativeEvent.isComposing) return;
    const combo = eventToCombo(event.nativeEvent);
    if (!combo) return;

    const classification = classifyCombo(combo);
    if (classification.kind === "reserved" || classification.kind === "blocked") {
      listenWith({ kind: "rejected", combo, reason: classification.reason });
      return;
    }
    if (combo === current) {
      onClose();
      return;
    }
    const owner = findConflict(
      effectiveBindings(getAppPreferences().shortcutBindings),
      combo,
      entry.id,
    );
    if (owner) {
      setStatus({ kind: "conflict", combo, owner });
      return;
    }
    submit(combo, false);
  }

  let title = "Press the new shortcut";
  let hint = "Press Esc to cancel";
  let rejected = false;
  if (status.kind === "rejected") {
    title = `${formatBinding(status.combo)} cannot be used`;
    hint = status.reason;
    rejected = true;
  } else if (status.kind === "conflict") {
    const owner = CATALOG_BY_ID[status.owner].label;
    title = `Used by ${owner}`;
    hint = `${formatBinding(status.combo)} moves from ${owner} to ${entry.label}.`;
  } else if (status.kind === "warn") {
    title = `Set to ${formatBinding(status.combo)}`;
    hint = status.reason;
  }

  return (
    <div
      ref={surfaceRef}
      className={styles.captureSurface}
      tabIndex={-1}
      data-popover-autofocus="true"
      onKeyDownCapture={handleKeyDown}
    >
      <div className={styles.captureMessage} role="status">
        <p className={[styles.captureTitle, rejected ? styles.captureRejected : ""].join(" ")}>
          {title}
        </p>
        <p className={styles.captureHint}>{hint}</p>
      </div>
      <div className={styles.captureActions}>
        {status.kind !== "conflict" && current !== undefined && (
          <Button
            size="compact"
            variant="ghost"
            className={styles.captureClear}
            onClick={() => {
              onClear();
              onClose();
            }}
          >
            Clear
          </Button>
        )}
        {status.kind === "warn" ? (
          <Button size="compact" variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <Button size="compact" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        )}
        {status.kind === "conflict" && (
          <Button
            size="compact"
            variant="primary"
            autoFocus
            onClick={() => submit(status.combo, true)}
          >
            Reassign
          </Button>
        )}
      </div>
    </div>
  );
}

interface ShortcutRowProps {
  entry: ActionCatalogEntry;
  combos: readonly string[];
  /** The keys differ from the current preset. */
  changed: boolean;
  captureSlot: Slot | null;
  idPrefix: string;
  onCaptureOpenChange: (id: ActionId, slot: Slot, open: boolean) => void;
  onApply: (id: ActionId, slot: Slot, combo: string, reassign: boolean) => void;
  onClear: (id: ActionId, slot: Slot) => void;
  onReset: (id: ActionId) => void;
}

const ShortcutRow = memo(function ShortcutRow({
  entry,
  combos,
  changed,
  captureSlot,
  idPrefix,
  onCaptureOpenChange,
  onApply,
  onClear,
  onReset,
}: ShortcutRowProps) {
  function renderSlot(slot: Slot) {
    const combo = combos[slot];
    const filled = combo !== undefined;
    const keyText = filled ? formatBinding(combo) : "";
    // The second key is offered as a small "+" next to the first, never as an empty slot.
    const addSecond = slot === 1 && !filled;
    let trigger: ReactNode = "Add";
    let label = `Add shortcut for ${entry.label}`;
    let className: string | undefined = [styles.slot, styles.slotEmpty].join(" ");
    if (filled) {
      trigger = <kbd className={styles.slotKey}>{keyText}</kbd>;
      label = `${entry.label} shortcut ${slot + 1}: ${keyText}`;
      className = [styles.slot, styles.slotFilled].join(" ");
    } else if (addSecond) {
      trigger = (
        <span className={styles.addSecondIcon} aria-hidden="true">
          <PlusIcon />
        </span>
      );
      label = `Add second shortcut for ${entry.label}`;
      className = styles.addSecond;
    }
    return (
      <span className={[styles.cell, slot === 0 ? styles.cellFirst : styles.cellSecond].join(" ")}>
        <Popover
          open={captureSlot === slot}
          onOpenChange={(open) => onCaptureOpenChange(entry.id, slot, open)}
          trigger={trigger}
          triggerProps={{
            id: `${idPrefix}-${entry.id}-${slot}`,
            className,
            "aria-label": label,
            "aria-haspopup": "dialog",
          }}
          tooltip={addSecond ? "Add second shortcut" : undefined}
          role="dialog"
          aria-label={`Set shortcut for ${entry.label}`}
          placement="bottom-end"
          initialFocus="first"
          dismissOnFocusLeave
          className={styles.capture}
        >
          <ShortcutCapture
            entry={entry}
            current={combo}
            onApply={(next, reassign) => onApply(entry.id, slot, next, reassign)}
            onClear={() => onClear(entry.id, slot)}
            onClose={() => onCaptureOpenChange(entry.id, slot, false)}
          />
        </Popover>
      </span>
    );
  }

  return (
    <div className={[styles.row, styles.editRow].join(" ")}>
      <span className={styles.label}>{entry.label}</span>
      {renderSlot(0)}
      {/* A second key only makes sense once the first one exists. */}
      {combos.length > 0 && renderSlot(1)}
      <span className={styles.reset}>
        <IconButton
          icon={<RestoreIcon />}
          aria-label={`Reset ${entry.label} shortcut`}
          tooltip={changed ? `Reset ${entry.label} shortcut` : undefined}
          disabled={!changed}
          onClick={() => onReset(entry.id)}
        />
      </span>
    </div>
  );
});

/** Settings → Shortcuts: presets, a searchable list of every action and a key capture per slot. */
export function ShortcutsSettings() {
  const { shortcutBindings, shortcutPreset } = useAppPreferences();
  const idPrefix = useId();
  const presetSelectId = `${idPrefix}-preset`;
  const descriptionId = `${idPrefix}-preset-description`;
  const questionId = `${idPrefix}-question`;
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [capture, setCapture] = useState<CaptureTarget | null>(null);
  const [pendingPreset, setPendingPreset] = useState<PresetId | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const effective = useMemo(() => effectiveBindings(shortcutBindings), [shortcutBindings]);
  const detected = useMemo(
    () => detectPreset(shortcutBindings, shortcutPreset),
    [shortcutBindings, shortcutPreset],
  );
  const isCustom = detected === "custom";
  const base = presetBindings(shortcutPreset);
  // A pending change only matters while there is something to discard.
  const confirming = isCustom ? pendingPreset : null;

  const words = useMemo(() => query.trim().toLowerCase().split(/\s+/).filter(Boolean), [query]);
  const visibleGroups = useMemo(() => {
    if (words.length === 0) return GROUPS;
    return GROUPS.map(({ group, entries }) => ({
      group,
      entries: entries.filter((entry) =>
        matchesQuery(searchTextOf(entry, effective[entry.id]), words),
      ),
    })).filter(({ entries }) => entries.length > 0);
  }, [effective, words]);
  const visibleFixed = useMemo(
    () =>
      words.length === 0
        ? FIXED_KEYS
        : FIXED_KEYS.filter((row) => matchesQuery(FIXED_SEARCH_TEXT.get(row.id) ?? "", words)),
    [words],
  );

  const focusPresetSelect = () => document.getElementById(presetSelectId)?.focus();

  function applyPreset(id: PresetId) {
    setAppPreference("shortcutBindings", resetAll(id));
    setAppPreference("shortcutPreset", id);
    setCapture(null);
    setPendingPreset(null);
    setAnnouncement(`${PRESETS[id].label} preset applied.`);
  }

  function choosePreset(choice: PresetChoice) {
    if (choice === "custom") return;
    if (isCustom) setPendingPreset(choice);
    else if (choice !== shortcutPreset) applyPreset(choice);
  }

  const handleCaptureOpenChange = useCallback((id: ActionId, slot: Slot, open: boolean) => {
    setCapture((current) => {
      if (open) return { id, slot };
      return current?.id === id && current.slot === slot ? null : current;
    });
  }, []);

  const handleApply = useCallback((id: ActionId, slot: Slot, combo: string, reassign: boolean) => {
    const before = getAppPreferences().shortcutBindings;
    const owner = reassign ? findConflict(effectiveBindings(before), combo, id) : null;
    const next = assignBinding(before, id, slot, combo, { reassign });
    if (next === before) return;
    setAppPreference("shortcutBindings", next);
    const after = effectiveBindings(next);
    let text = `${CATALOG_BY_ID[id].label} set to ${formatBinding(combo)}.`;
    if (owner) {
      text += ` Removed from ${CATALOG_BY_ID[owner].label}. ${usesText(owner, after)}`;
    }
    setAnnouncement(text);
  }, []);

  const handleClear = useCallback((id: ActionId, slot: Slot) => {
    const before = getAppPreferences().shortcutBindings;
    const combo = effectiveBindings(before)[id][slot];
    const next = clearBinding(before, id, slot);
    if (next === before || combo === undefined) return;
    setAppPreference("shortcutBindings", next);
    setAnnouncement(
      `${formatBinding(combo)} removed from ${CATALOG_BY_ID[id].label}. ${usesText(id, effectiveBindings(next))}`,
    );
  }, []);

  const handleResetRow = useCallback(
    (id: ActionId) => {
      const { shortcutBindings: before, shortcutPreset: presetId } = getAppPreferences();
      const next = resetAction(before, id, presetId);
      setAppPreference("shortcutBindings", next);
      setAnnouncement(
        `${CATALOG_BY_ID[id].label} shortcut reset. ${usesText(id, effectiveBindings(next))}`,
      );
      // The reset button leaves the tab order once the row matches the preset: keep focus in the row.
      document.getElementById(`${idPrefix}-${id}-0`)?.focus();
    },
    [idPrefix],
  );

  const restoring = confirming === shortcutPreset;
  const empty = visibleGroups.length === 0 && visibleFixed.length === 0;
  // "Custom" in the picker already says the state; this is for assistive technology only.
  const description = isCustom
    ? `Customized from ${PRESETS[shortcutPreset].label}.`
    : PRESETS[shortcutPreset].description;

  return (
    <>
      <div className={styles.header}>
        <div className={styles.toolbar}>
          <Select<PresetChoice>
            id={presetSelectId}
            className={styles.presetSelect}
            label="Preset"
            describedBy={descriptionId}
            value={detected}
            options={isCustom ? PRESET_OPTIONS_WITH_CUSTOM : PRESET_OPTIONS}
            onChange={choosePreset}
          />
          <div className={styles.search}>
            <Input
              ref={searchRef}
              className={styles.searchInput}
              type="search"
              aria-label="Search shortcuts"
              placeholder="Search shortcuts"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {/* Laid over the field's end rather than passed as `trailing`, which would remount the input. */}
            {query && (
              <span className={styles.clear}>
                <IconButton
                  className={styles.clearButton}
                  icon={<CloseIcon />}
                  aria-label="Clear search"
                  tooltip="Clear search"
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                />
              </span>
            )}
          </div>
          <IconButton
            icon={<RestoreIcon />}
            aria-label="Reset all shortcuts"
            tooltip="Reset all shortcuts"
            disabled={!isCustom || confirming !== null}
            onClick={() => setPendingPreset(shortcutPreset)}
          />
        </div>
        <span id={descriptionId} className={styles.visuallyHidden}>
          {description}
        </span>
        {confirming && (
          <div className={styles.confirm}>
            <p id={questionId} className={styles.confirmText}>
              {`Discard your changes and ${restoring ? "restore" : "switch to"} ${PRESETS[confirming].label}?`}
            </p>
            <Button
              size="compact"
              variant="ghost"
              autoFocus
              aria-describedby={questionId}
              onClick={() => {
                setPendingPreset(null);
                focusPresetSelect();
              }}
            >
              Cancel
            </Button>
            <Button
              size="compact"
              variant="danger"
              aria-describedby={questionId}
              onClick={() => {
                applyPreset(confirming);
                focusPresetSelect();
              }}
            >
              {restoring ? "Reset" : "Switch"}
            </Button>
          </div>
        )}
      </div>
      <div className={styles.list}>
        {visibleGroups.map(({ group, entries }) => (
          <Fragment key={group}>
            <h3 className={styles.groupTitle}>{group}</h3>
            {entries.map((entry) => (
              <ShortcutRow
                key={entry.id}
                entry={entry}
                combos={effective[entry.id]}
                changed={!sameCombos(effective[entry.id], base[entry.id])}
                captureSlot={capture?.id === entry.id ? capture.slot : null}
                idPrefix={idPrefix}
                onCaptureOpenChange={handleCaptureOpenChange}
                onApply={handleApply}
                onClear={handleClear}
                onReset={handleResetRow}
              />
            ))}
          </Fragment>
        ))}
        {visibleFixed.length > 0 && (
          <>
            <h3 className={styles.groupTitle}>{FIXED_KEYS_GROUP}</h3>
            {visibleFixed.map((row) => (
              <div key={row.id} className={styles.row}>
                <span className={styles.label}>{row.label}</span>
                <span className={styles.fixedKeys}>
                  {row.keys.map((key) => (
                    <kbd key={key} className={styles.kbd}>
                      {key}
                    </kbd>
                  ))}
                </span>
              </div>
            ))}
          </>
        )}
        {empty && (
          <div className={styles.empty}>
            <p>No shortcuts match</p>
          </div>
        )}
      </div>
      <p className={styles.visuallyHidden} role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </>
  );
}
