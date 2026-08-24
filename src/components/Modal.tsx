import type { ReactNode } from "react";
import { Dialog } from "./ui";

interface ModalProps {
  title: string;
  children: ReactNode;
  onCancel?: () => void;
  modal?: boolean;
}

export function Modal({ title, children, onCancel, modal = true }: ModalProps) {
  return (
    <Dialog open title={title} onClose={onCancel ?? (() => undefined)} modal={modal}>
      {children}
    </Dialog>
  );
}
