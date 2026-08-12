import { useEffect, useRef, type ReactNode } from "react";
import styles from "./Modal.module.css";

interface ModalProps {
  title: string;
  children: ReactNode;
  onCancel?: () => void;
  labelledBy?: string;
  modal?: boolean;
}

export function Modal({
  title,
  children,
  onCancel,
  labelledBy = "modal-title",
  modal = true,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) {
      if (modal) dialog.showModal();
      else dialog.show();
    }
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, [modal]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        if (!onCancel) {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        onCancel();
      }}
      onKeyDown={(event) => {
        if (!modal && event.key === "Escape" && onCancel) {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <h2 id={labelledBy}>{title}</h2>
      {children}
    </dialog>
  );
}
