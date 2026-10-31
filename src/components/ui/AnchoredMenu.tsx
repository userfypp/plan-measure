import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  Popover,
  focusPopoverContentElement,
  type PopoverPlacement,
  type PopoverTriggerProps,
} from "./Popover";
import type { TooltipPosition } from "./Tooltip";
import styles from "./AnchoredMenu.module.css";

export type AnchoredMenuItemRole = "menuitem" | "menuitemcheckbox" | "menuitemradio";

interface AnchoredMenuItemBase {
  id: string;
  label: ReactNode;
  sectionLabel?: string;
  role?: AnchoredMenuItemRole;
  checked?: boolean;
  current?: boolean;
  disabled?: boolean;
}

export type AnchoredMenuItem = AnchoredMenuItemBase &
  (
    | {
        onSelect: () => void;
        href?: never;
        target?: never;
        rel?: never;
      }
    | {
        href: string;
        target?: string;
        rel?: string;
        onSelect?: never;
      }
  );

export interface AnchoredMenuProps {
  trigger: ReactNode;
  triggerProps?: PopoverTriggerProps;
  /** Tooltip for an icon-only trigger; hidden while the menu is open. */
  tooltip?: ReactNode;
  tooltipPosition?: TooltipPosition;
  className?: string;
  label: string;
  items: readonly AnchoredMenuItem[] | (() => readonly AnchoredMenuItem[]);
  placement?: PopoverPlacement;
  matchTriggerWidth?: boolean;
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
  tooltip,
  tooltipPosition,
  className,
  label,
  items: providedItems,
  placement = "bottom-start",
  matchTriggerWidth,
  open,
  defaultOpen = false,
  onOpenChange,
}: AnchoredMenuProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const isOpen = open ?? uncontrolledOpen;
  const items = useMemo(
    () => (typeof providedItems === "function" ? (isOpen ? providedItems() : []) : providedItems),
    [providedItems, isOpen],
  );
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const initialFocusIndex = useMemo(() => firstInitialFocusIndex(items), [items]);
  const selectionMenu = items.some(
    (item) =>
      item.role === "menuitemcheckbox" ||
      item.role === "menuitemradio" ||
      item.checked !== undefined ||
      item.current !== undefined,
  );
  const tabbableIndex = focusIndex ?? initialFocusIndex;

  function setOpen(nextOpen: boolean) {
    setFocusIndex(null);
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
    if (item.href) {
      itemRefs.current[index]?.click();
      return;
    }
    item.onSelect?.();
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented) return;
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
      tooltip={tooltip}
      tooltipPosition={tooltipPosition}
      open={isOpen}
      onOpenChange={setOpen}
      placement={placement}
      matchTriggerWidth={matchTriggerWidth}
      initialFocus="first"
      dismissOnFocusLeave
      role="menu"
      aria-label={label}
      className={[styles.menu, selectionMenu ? styles.selectionMenu : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={styles.items} onKeyDown={handleKeyDown}>
        {items.map((item, index) => {
          const role = item.role ?? "menuitem";
          const content = (
            <>
              <span className={styles.label}>{item.label}</span>
            </>
          );
          const sectionLabel = item.sectionLabel ? (
            <div
              key={`${item.id}-section`}
              role="separator"
              aria-label={item.sectionLabel}
              data-menu-section-label="true"
              className={styles.sectionLabel}
            >
              {item.sectionLabel}
            </div>
          ) : null;
          if (item.href) {
            return [
              sectionLabel,
              <a
                key={item.id}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                href={item.href}
                target={item.target}
                rel={item.rel}
                role={role}
                aria-checked={
                  role === "menuitemradio" || role === "menuitemcheckbox"
                    ? Boolean(item.checked)
                    : undefined
                }
                aria-current={item.current ? "true" : undefined}
                aria-disabled={item.disabled || undefined}
                tabIndex={index === tabbableIndex ? 0 : -1}
                data-popover-autofocus={index === initialFocusIndex ? "true" : undefined}
                className={styles.item}
                onFocus={() => setFocusIndex(index)}
                onClick={(event) => {
                  if (item.disabled) {
                    event.preventDefault();
                    return;
                  }
                  setOpen(false);
                }}
              >
                {content}
              </a>,
            ];
          }
          return [
            sectionLabel,
            <button
              key={item.id}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              type="button"
              role={role}
              aria-checked={
                role === "menuitemradio" || role === "menuitemcheckbox"
                  ? Boolean(item.checked)
                  : undefined
              }
              aria-current={item.current ? "true" : undefined}
              aria-disabled={item.disabled || undefined}
              tabIndex={index === tabbableIndex ? 0 : -1}
              data-popover-autofocus={index === initialFocusIndex ? "true" : undefined}
              className={styles.item}
              title={typeof item.label === "string" ? item.label : undefined}
              onFocus={() => setFocusIndex(index)}
              onClick={() => selectItem(index)}
            >
              {content}
            </button>,
          ];
        })}
      </div>
    </Popover>
  );
}
