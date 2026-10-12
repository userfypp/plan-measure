import { AnchoredMenu, type AnchoredMenuItem } from "./AnchoredMenu";
import { ChevronDownIcon } from "./ChevronDownIcon";
import type { PopoverTriggerProps } from "./Popover";
import styles from "./Select.module.css";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string> {
  id?: string;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  label: string;
  labelledBy?: string;
  describedBy?: string;
  disabled?: boolean;
  className?: string;
  triggerProps?: PopoverTriggerProps &
    Record<`data-${string}`, string | undefined> & {
      name?: string;
    };
}

/** Lets viewer shortcuts ignore typing on the trigger, as they do for a native select. */
const SELECT_TRIGGER_ATTRIBUTES = { "data-select-trigger": "true" };

export function Select<T extends string>({
  id,
  value,
  options,
  onChange,
  label,
  labelledBy,
  describedBy,
  disabled = false,
  className,
  triggerProps,
}: SelectProps<T>) {
  const selected = options.find((option) => option.value === value);
  const items: AnchoredMenuItem[] = options.map((option) => ({
    id: option.value,
    label: option.label,
    role: "menuitemradio",
    checked: option.value === value,
    disabled: option.disabled,
    onSelect: () => onChange(option.value),
  }));
  const { className: triggerClassName, ...restTriggerProps } = triggerProps ?? {};

  return (
    <AnchoredMenu
      trigger={
        <>
          <span className={styles.value}>{selected?.label ?? ""}</span>
          <ChevronDownIcon />
        </>
      }
      triggerProps={{
        ...restTriggerProps,
        ...SELECT_TRIGGER_ATTRIBUTES,
        id,
        disabled,
        "aria-label": labelledBy ? undefined : label,
        "aria-labelledby": labelledBy && id ? `${labelledBy} ${id}` : undefined,
        "aria-describedby": describedBy,
        className: [styles.trigger, className, triggerClassName].filter(Boolean).join(" "),
      }}
      label={label}
      items={items}
      placement="bottom-start"
      matchTriggerWidth
      showMarkerColumn={false}
      className={styles.list}
    />
  );
}
