import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  AnchoredMenu,
  ArrowLeftIcon,
  IconButton,
  Input,
  MoveToIcon,
  SaveIcon,
  Tooltip,
  TrashIcon,
} from "../components/ui";
import {
  setSelectedCountItem,
  useSelectedCountItem,
} from "../features/measurements/countItemFocus";
import type { CountMeasurement, Measurement } from "../types/domain";
import { isBlockingOverlayOpen, useShortcutHandlers } from "../utils/shortcuts/dispatcher";
import { useShortcutAria, useShortcutLabel } from "../utils/shortcuts/store";
import { countItemLabel, countItemName } from "../utils/countItems";
import { ToolbarComposite } from "./ContextToolbar";
import { useSessionState } from "./sessionState";
import styles from "./ContextToolbar.module.css";

function Divider() {
  return <span className={styles.divider} aria-hidden="true" />;
}

interface ItemToolbarProps {
  measurement: CountMeasurement;
  index: number;
  /** The counts among them, other than this one, are where the item can move to. */
  pageMeasurements: readonly Measurement[];
  pageNumber: number;
  onMove: (index: number, targetId: string) => void;
  /** Asks to delete the whole count: what deleting its last item means. */
  onDeleteCount: () => void;
}

/** The item's name, renamed in place: Enter saves, Escape cancels and an empty name restores "Item N". */
function ItemNameEditor({
  number,
  name,
  label,
  onRename,
}: {
  number: number;
  name: string;
  label: string;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef(false);
  const shortcut = useShortcutLabel("edit.rename");
  const keyShortcuts = useShortcutAria("edit.rename");
  const subject = `item ${number}`;

  useLayoutEffect(() => {
    if (editing) {
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    } else if (returnFocusRef.current) {
      returnFocusRef.current = false;
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, [editing]);

  function start() {
    setDraft(name);
    setEditing(true);
  }
  function finish(commit: boolean) {
    const next = draft.trim();
    if (commit && next !== name) onRename(next);
    returnFocusRef.current = true;
    setEditing(false);
  }
  useShortcutHandlers((action, event) => {
    if (action !== "edit.rename" || editing || isBlockingOverlayOpen()) return false;
    event.preventDefault();
    start();
    return true;
  });

  if (!editing) {
    return (
      <Tooltip
        content={shortcut ? `Rename ${subject} (${shortcut})` : `Rename ${subject}`}
        position="bottom"
      >
        <button
          ref={triggerRef}
          type="button"
          className={styles.measurementNameTrigger}
          aria-label={`Rename ${subject}`}
          aria-keyshortcuts={keyShortcuts || undefined}
          onClick={start}
        >
          <span>{label}</span>
        </button>
      </Tooltip>
    );
  }
  return (
    <form
      className={styles.renameForm}
      aria-label={`Rename ${subject}`}
      data-toolbar-inline-editor
      onSubmit={(event) => {
        event.preventDefault();
        finish(true);
      }}
    >
      <Input
        ref={inputRef}
        className={styles.renameInput}
        value={draft}
        placeholder={`Item ${number}`}
        aria-label={`Name for ${subject}`}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            if (event.nativeEvent.isComposing) return;
            event.preventDefault();
            finish(true);
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            finish(false);
          }
        }}
        trailing={
          <IconButton
            className={styles.selectionControlSize}
            type="submit"
            icon={<SaveIcon />}
            aria-label="Save"
            tooltip="Save"
            tooltipPosition="bottom"
            tone="primary"
            tabIndex={-1}
          />
        }
      />
    </form>
  );
}

/** The controls of the count item the user picked, in place of the count's own. */
function ItemToolbar({
  measurement,
  index,
  pageMeasurements,
  pageNumber,
  onMove,
  onDeleteCount,
}: ItemToolbarProps) {
  const { renameCountItem, removeCountItem } = useSessionState();
  const number = index + 1;
  const deleteShortcut = useShortcutLabel("edit.delete");
  const deleteKeyShortcuts = useShortcutAria("edit.delete");
  function deleteItem() {
    if (measurement.points.length === 1) {
      onDeleteCount();
      return;
    }
    removeCountItem({ pageNumber, id: measurement.id, itemIndex: index });
    // The next item takes the place of the removed one, or the last one when it was the last.
    setSelectedCountItem({
      measurementId: measurement.id,
      index: Math.min(index, measurement.points.length - 2),
    });
  }
  // Delete removes the item, never the count: this handler mounts after the app's, so it runs first.
  useShortcutHandlers((action, event) => {
    if (action !== "edit.delete" || isBlockingOverlayOpen()) return false;
    event.preventDefault();
    deleteItem();
    return true;
  });
  const moveTargets = pageMeasurements
    .filter((candidate) => candidate.type === "count" && candidate.id !== measurement.id)
    .map((count) => ({
      id: count.id,
      label: `${count.name}${count.visible ? "" : " (hidden)"}`,
    }));
  return (
    <ToolbarComposite label="Selected count item controls" contextKind="selection">
      <IconButton
        className={styles.selectionIconButton}
        icon={<ArrowLeftIcon />}
        aria-label={`Back to ${measurement.name}`}
        tooltip={`Back to ${measurement.name} (Esc)`}
        tooltipPosition="bottom"
        onClick={() => setSelectedCountItem(null)}
      />
      <ItemNameEditor
        key={`${measurement.id}:${index}`}
        number={number}
        name={countItemName(measurement, index)}
        label={countItemLabel(measurement, index)}
        onRename={(name) =>
          renameCountItem({ pageNumber, id: measurement.id, itemIndex: index, name })
        }
      />
      <Divider />
      <AnchoredMenu
        trigger={<MoveToIcon className={styles.selectionIcon} />}
        triggerProps={{
          className: styles.selectionIconButton,
          "aria-label": `Move item ${number} to another count`,
          disabled: moveTargets.length === 0,
        }}
        tooltip={moveTargets.length === 0 ? "Create another count on this page first" : "Move to…"}
        tooltipPosition="bottom"
        label={`Move item ${number} to count`}
        placement="bottom-start"
        items={() =>
          moveTargets.map((target) => ({
            id: target.id,
            label: target.label,
            onSelect: () => {
              onMove(index, target.id);
              setSelectedCountItem(null);
            },
          }))
        }
      />
      <Divider />
      <IconButton
        className={`${styles.selectionIconButton} ${styles.selectionDanger}`}
        tone="danger"
        icon={<TrashIcon />}
        aria-label={`Delete item ${number}`}
        aria-keyshortcuts={deleteKeyShortcuts || undefined}
        tooltip={
          deleteShortcut ? `Delete item ${number} (${deleteShortcut})` : `Delete item ${number}`
        }
        tooltipPosition="bottom"
        onClick={deleteItem}
      />
    </ToolbarComposite>
  );
}

/** The item's controls while one of the count's items is picked; the count's own controls otherwise. */
export default function CountItemToolbar({
  children,
  ...props
}: Omit<ItemToolbarProps, "index" | "pageNumber" | "pageMeasurements"> & {
  children: ReactNode;
}) {
  const item = useSelectedCountItem();
  const { session } = useSessionState();
  const page = session?.pages[session.currentPage];
  return page &&
    item?.measurementId === props.measurement.id &&
    item.index < props.measurement.points.length ? (
    <ItemToolbar
      {...props}
      index={item.index}
      pageNumber={page.pageNumber}
      pageMeasurements={page.measurements}
    />
  ) : (
    children
  );
}
