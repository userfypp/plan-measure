import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  Popover,
  focusPopoverContentElement,
  type PopoverPlacement,
  type PopoverTriggerProps,
} from "./Popover";
import styles from "./AnchoredMenu.module.css";

export type AnchoredMenuItemRole = "menuitem" | "menuitemradio";

export interface AnchoredMenuItem {
  id: string;
  label: ReactNode;
  onSelect: () => void;
  role?: AnchoredMenuItemRole;
  checked?: boolean;
  current?: boolean;
  disabled?: boolean;
}

export interface AnchoredMenuProps {
  trigger: ReactNode;
  triggerProps?: PopoverTriggerProps;
  label: string;
  items: readonly AnchoredMenuItem[];
  placement?: PopoverPlacement;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function firstInitialFocusIndex(items: readonly AnchoredMenuItem[]): number {
  const current = items.findIndex((item) => item.checked || item.current);
  return current >= 0 ? current : items.length > 0 ? 0 : -1;
}

export function AnchoredMenu({
  trigger,
  triggerProps,
  label,
  items,
  placement = "bottom-start",
  open,
  defaultOpen = false,
  onOpenChange,
}: AnchoredMenuProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const isOpen = open ?? uncontrolledOpen;
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const initialFocusIndex = useMemo(() => firstInitialFocusIndex(items), [items]);
  const tabbableIndex = focusIndex ?? initialFocusIndex;

  function setOpen(nextOpen: boolean) {
    setFocusIndex(nextOpen ? initialFocusIndex : null);
    if (open === undefined) setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }

  function navigableIndices(): number[] {
    return items.map((_, index) => index);
  }

  function focusBoundary(position: "first" | "last") {
    const navigable = navigableIndices();
    const index = position === "first" ? navigable[0] : navigable.at(-1);
    if (index !== undefined) {
      setFocusIndex(index);
      focusPopoverContentElement(itemRefs.current[index]);
    }
  }

  function moveFocus(direction: 1 | -1) {
    const navigable = navigableIndices();
    if (navigable.length === 0) return;
    const currentIndex = itemRefs.current.findIndex((item) => item === document.activeElement);
    const navigablePosition = navigable.indexOf(currentIndex);
    const startPosition = navigablePosition >= 0 ? navigablePosition : direction > 0 ? -1 : 0;
    const nextPosition = (startPosition + direction + navigable.length) % navigable.length;
    const nextIndex = navigable[nextPosition]!;
    setFocusIndex(nextIndex);
    focusPopoverContentElement(itemRefs.current[nextIndex]);
  }

  function selectItem(index: number) {
    const item = items[index];
    if (!item || item.disabled) return;
    item.onSelect();
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(-1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      focusBoundary("first");
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      focusBoundary("last");
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") return;
    const index = itemRefs.current.findIndex((item) => item === document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    selectItem(index);
  }

  return (
    <Popover
      trigger={trigger}
      triggerProps={{ ...triggerProps, "aria-haspopup": "menu" }}
      open={isOpen}
      onOpenChange={setOpen}
      placement={placement}
      initialFocus="first"
      role="menu"
      aria-label={label}
      className={styles.menu}
    >
      <div className={styles.items} onKeyDown={handleKeyDown}>
        {items.map((item, index) => {
          const role = item.role ?? "menuitem";
          const activeState = item.checked || item.current;
          return (
            <button
              key={item.id}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              type="button"
              role={role}
              aria-checked={role === "menuitemradio" ? Boolean(item.checked) : undefined}
              aria-current={item.current ? "true" : undefined}
              aria-disabled={item.disabled || undefined}
              tabIndex={index === tabbableIndex ? 0 : -1}
              data-popover-autofocus={index === initialFocusIndex ? "true" : undefined}
              className={styles.item}
              onFocus={() => setFocusIndex(index)}
              onClick={() => selectItem(index)}
            >
              <span className={styles.marker} aria-hidden="true">
                {activeState ? "✓" : ""}
              </span>
              <span className={styles.label}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </Popover>
  );
}
