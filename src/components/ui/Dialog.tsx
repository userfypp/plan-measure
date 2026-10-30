import {
  useCallback,
  useId,
  useInsertionEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import styles from "./Dialog.module.css";

// Read by Tooltip, which must not open for the focus the dialog moves in on its own.
const INITIAL_FOCUS_ATTRIBUTE = "data-initial-focus";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"]):not([disabled])',
].join(", ");

export type DialogSize = "small" | "medium" | "large";

export interface DialogProps {
  open: boolean;
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  size?: DialogSize;
  className?: string;
  bodyClassName?: string;
  initialFocus?: RefObject<HTMLElement | null>;
  descriptionId?: string;
  modal?: boolean;
  trapFocus?: boolean;
}

function focusElement(element: HTMLElement | null): boolean {
  if (!element?.isConnected) return false;
  element.focus({ preventScroll: true });
  return document.activeElement === element;
}

/** Runs `move`, a focus change the dialog makes on its own; tooltips ignore it, as nothing was hovered. */
function withInitialFocusMarker<T>(dialog: HTMLDialogElement, move: () => T): T {
  dialog.setAttribute(INITIAL_FOCUS_ATTRIBUTE, "");
  try {
    return move();
  } finally {
    dialog.removeAttribute(INITIAL_FOCUS_ATTRIBUTE);
  }
}

function getFocusableElements(dialog: HTMLDialogElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

function getInitialFocus(
  dialog: HTMLDialogElement,
  initialFocus: RefObject<HTMLElement | null> | undefined,
): HTMLElement {
  const requestedFocus = initialFocus?.current;
  if (
    requestedFocus &&
    dialog.contains(requestedFocus) &&
    !requestedFocus.hasAttribute("disabled")
  ) {
    return requestedFocus;
  }

  return (
    dialog.querySelector<HTMLElement>("[autofocus]:not([disabled])") ??
    dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
    dialog
  );
}

export function Dialog({
  open,
  title,
  children,
  actions,
  onClose,
  size = "medium",
  className,
  bodyClassName,
  initialFocus,
  descriptionId,
  modal = true,
  trapFocus = false,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const openRef = useRef(open);
  const unmountingRef = useRef(false);
  const suppressedCloseEventsRef = useRef(0);
  const lastFocusedInsideRef = useRef<HTMLElement | null>(null);
  const restoringFocusRef = useRef(false);
  const titleId = useId();

  const restoreFocus = useCallback((deferUntilUnmount = false) => {
    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    const restoreTarget = restoreFocusRef.current;
    restoreFocusRef.current = null;
    lastFocusedInsideRef.current = null;

    const applyRestore = () => {
      restoringFocusRef.current = true;
      try {
        if (!focusElement(restoreTarget)) {
          focusElement(document.querySelector<HTMLElement>("[data-dialog-focus-fallback]"));
        }
      } finally {
        restoringFocusRef.current = false;
      }
    };

    if (!deferUntilUnmount) {
      applyRestore();
      return;
    }

    queueMicrotask(() => {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement && activeElement.closest("dialog[open]")) return;
      applyRestore();
    });
  }, []);

  const handleNativeClose = useCallback(() => {
    if (suppressedCloseEventsRef.current > 0) {
      suppressedCloseEventsRef.current -= 1;
      return;
    }
    const wasOpen = wasOpenRef.current;
    restoreFocus();
    if (wasOpen && openRef.current && !unmountingRef.current) onClose();
  }, [onClose, restoreFocus]);

  useInsertionEffect(() => {
    if (!open || wasOpenRef.current) return;
    const activeElement = document.activeElement;
    restoreFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;
  }, [open]);

  useLayoutEffect(() => {
    openRef.current = open;
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      // The browser moves focus into the dialog while opening it, before the explicit focus below.
      const initial = withInitialFocusMarker(dialog, () => {
        if (modal) dialog.showModal();
        else dialog.show();
        wasOpenRef.current = true;
        const target = getInitialFocus(dialog, initialFocus);
        focusElement(target);
        return target;
      });
      lastFocusedInsideRef.current = initial;
      return;
    }

    if (!open && dialog.open) {
      suppressedCloseEventsRef.current += 1;
      dialog.close();
      restoreFocus();
    }
  }, [initialFocus, modal, open, restoreFocus]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    unmountingRef.current = false;
    return () => {
      unmountingRef.current = true;
      if (dialog?.open) {
        suppressedCloseEventsRef.current += 1;
        dialog.close();
      }
      restoreFocus(trapFocus);
    };
  }, [restoreFocus, trapFocus]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !trapFocus || !dialog?.open) return;

    const handleFocusIn = (event: FocusEvent) => {
      if (restoringFocusRef.current || unmountingRef.current || !openRef.current) return;
      const target = event.target;
      if (target instanceof HTMLElement && dialog.contains(target)) {
        lastFocusedInsideRef.current = target;
        return;
      }

      const fallback = lastFocusedInsideRef.current;
      if (!focusElement(fallback)) {
        const initial = withInitialFocusMarker(dialog, () => {
          const target = getInitialFocus(dialog, initialFocus);
          focusElement(target);
          return target;
        });
        lastFocusedInsideRef.current = initial;
      }
    };

    document.addEventListener("focusin", handleFocusIn, true);
    return () => document.removeEventListener("focusin", handleFocusIn, true);
  }, [initialFocus, open, trapFocus]);

  return (
    <dialog
      ref={dialogRef}
      className={[styles.dialog, styles[size], className].filter(Boolean).join(" ")}
      role="dialog"
      aria-modal={modal || undefined}
      data-focus-trap={trapFocus ? "" : undefined}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      tabIndex={-1}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.defaultPrevented) return;

        if (event.key === "Tab" && trapFocus) {
          const focusable = getFocusableElements(event.currentTarget);
          if (focusable.length === 0) {
            event.preventDefault();
            focusElement(event.currentTarget);
            return;
          }

          const first = focusable[0]!;
          const last = focusable[focusable.length - 1]!;
          const active = document.activeElement;
          if (event.shiftKey) {
            if (active === first || !event.currentTarget.contains(active)) {
              event.preventDefault();
              focusElement(last);
            }
          } else if (active === last || !event.currentTarget.contains(active)) {
            event.preventDefault();
            focusElement(first);
          }
          return;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
      onClose={handleNativeClose}
    >
      <header className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
      </header>
      <div className={[styles.body, bodyClassName].filter(Boolean).join(" ")}>{children}</div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </dialog>
  );
}
