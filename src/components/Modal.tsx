import type { ReactNode } from "react";
import { Dialog } from "./ui";

interface ModalProps {
  title: string;
  children: ReactNode;
  onCancel?: () => void;
  modal?: boolean;
  trapFocus?: boolean;
}

export function Modal({ title, children, onCancel, modal = true, trapFocus = false }: ModalProps) {
  return (
    <Dialog
      open
      title={title}
      onClose={onCancel ?? (() => undefined)}
      modal={modal}
      trapFocus={trapFocus}
    >
      {children}
    </Dialog>
  );
}
