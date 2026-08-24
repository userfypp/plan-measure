import { useCallback, useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import styles from "./Dialog.module.css";

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
  initialFocus?: RefObject<HTMLElement | null>;
  descriptionId?: string;
  modal?: boolean;
}

function focusElement(element: HTMLElement | null): boolean {
  if (!element?.isConnected) return false;
  element.focus({ preventScroll: true });
  return document.activeElement === element;
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
  initialFocus,
  descriptionId,
  modal = true,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const openRef = useRef(open);
  const unmountingRef = useRef(false);
  const suppressedCloseEventsRef = useRef(0);
  const titleId = useId();

  const restoreFocus = useCallback(() => {
    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    if (!focusElement(restoreFocusRef.current)) {
      focusElement(document.querySelector<HTMLElement>("[data-dialog-focus-fallback]"));
    }
    restoreFocusRef.current = null;
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

  useLayoutEffect(() => {
    openRef.current = open;
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      const activeElement = document.activeElement;
      restoreFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;
      if (modal) dialog.showModal();
      else dialog.show();
      wasOpenRef.current = true;
      focusElement(getInitialFocus(dialog, initialFocus));
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
      restoreFocus();
    };
  }, [restoreFocus]);

  return (
    <dialog
      ref={dialogRef}
      className={[styles.dialog, styles[size]].join(" ")}
      role="dialog"
      aria-modal={modal || undefined}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      tabIndex={-1}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
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
      <div className={styles.body}>{children}</div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </dialog>
  );
}
