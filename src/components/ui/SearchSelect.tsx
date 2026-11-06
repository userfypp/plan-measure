import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { classificationSearchKey } from "../../utils/classificationNames";
import { ChevronDownIcon } from "./ChevronDownIcon";
import { SearchIcon } from "./icons";
import { Input } from "./Input";
import { Popover, type PopoverTriggerProps } from "./Popover";
import styles from "./SearchSelect.module.css";

export interface SearchSelectOption<T extends string> {
  value: T;
  label: string;
  /** Shown on the closed trigger instead of the label; also ranks a search that matches it. */
  shortLabel?: string;
}

export interface SearchSelectProps<T extends string> {
  id?: string;
  /** The chosen option; a value without an option shows the placeholder. */
  value: T;
  options: readonly SearchSelectOption<T>[];
  onChange: (value: T) => void;
  label: string;
  labelledBy?: string;
  describedBy?: string;
  /** Shown on the trigger while no option is chosen. */
  placeholder: string;
  searchLabel: string;
  /** Shown when the search matches nothing. */
  emptyLabel: string;
  disabled?: boolean;
  className?: string;
}

/** Lets viewer shortcuts ignore typing on the trigger, as they do for a native select. */
const TRIGGER_ATTRIBUTES = { "data-select-trigger": "true" };

/** The options every word of the query appears in; an exact then a leading short label first. */
function filterOptions<T extends string>(
  options: readonly SearchSelectOption<T>[],
  query: string,
): SearchSelectOption<T>[] {
  const words = classificationSearchKey(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...options];
  const whole = words.join(" ");
  const ranked: Array<{ option: SearchSelectOption<T>; rank: number }> = [];
  for (const option of options) {
    const label = classificationSearchKey(option.label);
    if (!words.every((word) => label.includes(word))) continue;
    const short = option.shortLabel ? classificationSearchKey(option.shortLabel) : null;
    ranked.push({ option, rank: short === whole ? 0 : short?.startsWith(whole) ? 1 : 2 });
  }
  return ranked.sort((a, b) => a.rank - b.rank).map(({ option }) => option);
}

/**
 * A select for long lists: the same trigger as `Select`, opening a searchable list. Keep it out of
 * the main bundle by importing it from lazy UI only.
 */
export function SearchSelect<T extends string>({
  id,
  value,
  options,
  onChange,
  label,
  labelledBy,
  describedBy,
  placeholder,
  searchLabel,
  emptyLabel,
  disabled = false,
  className,
}: SearchSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeValue, setActiveValue] = useState<T | null>(null);
  const listId = useId();
  const optionId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.value === value);
  const visible = useMemo(() => filterOptions(options, query), [options, query]);
  // The highlight follows the search: it stays on a still-listed option, else the first one.
  const active = visible.find((option) => option.value === activeValue) ?? visible[0];
  const activeId = active ? `${optionId}-${options.indexOf(active)}` : undefined;

  function changeOpen(next: boolean) {
    setOpen(next);
    setQuery("");
    setActiveValue(selected ? selected.value : null);
  }

  function choose(option: SearchSelectOption<T>) {
    onChange(option.value);
    changeOpen(false);
  }

  useLayoutEffect(() => {
    if (!open || !activeId) return;
    document.getElementById(activeId)?.scrollIntoView?.({ block: "nearest" });
  }, [open, activeId]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      if (active) choose(active);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    if (visible.length === 0) return;
    const index = active ? visible.indexOf(active) : -1;
    const step = event.key === "ArrowDown" ? 1 : -1;
    setActiveValue(visible[(index + step + visible.length) % visible.length]!.value);
  }

  const triggerProps: PopoverTriggerProps & Record<`data-${string}`, string | undefined> = {
    ...TRIGGER_ATTRIBUTES,
    id,
    disabled,
    "aria-haspopup": "dialog",
    "aria-label": labelledBy ? undefined : label,
    "aria-labelledby": labelledBy && id ? `${labelledBy} ${id}` : undefined,
    "aria-describedby": describedBy,
    className: [styles.trigger, className].filter(Boolean).join(" "),
  };

  return (
    <Popover
      trigger={
        <>
          <span className={selected ? styles.value : styles.placeholder}>
            <span className={styles.valueRun}>
              <span className={styles.valueText}>
                {selected ? (selected.shortLabel ?? selected.label) : placeholder}
              </span>
            </span>
          </span>
          <ChevronDownIcon />
        </>
      }
      triggerProps={triggerProps}
      open={open}
      onOpenChange={changeOpen}
      placement="bottom-start"
      matchTriggerWidth
      initialFocus="first"
      dismissOnFocusLeave
      role="dialog"
      aria-label={label}
      className={styles.panel}
    >
      <Input
        ref={searchRef}
        type="search"
        role="combobox"
        aria-label={searchLabel}
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={activeId}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        placeholder={searchLabel}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onClear={() => {
          setQuery("");
          searchRef.current?.focus();
        }}
        onKeyDown={handleKeyDown}
        leading={<SearchIcon />}
      />
      <div id={listId} role="listbox" aria-label={label} className={styles.list}>
        {visible.map((option) => (
          <div
            key={option.value}
            id={`${optionId}-${options.indexOf(option)}`}
            role="option"
            aria-selected={option.value === value}
            data-active={option === active || undefined}
            title={option.label}
            className={styles.option}
            // Keeps the focus in the search field while the pointer picks.
            onMouseDown={(event) => event.preventDefault()}
            onPointerMove={() => setActiveValue(option.value)}
            onClick={() => choose(option)}
          >
            <span className={styles.optionLabel}>{option.label}</span>
          </div>
        ))}
      </div>
      <p role="status" className={visible.length === 0 ? styles.empty : styles.visuallyHidden}>
        {visible.length === 0 ? emptyLabel : `${visible.length} found`}
      </p>
    </Popover>
  );
}
