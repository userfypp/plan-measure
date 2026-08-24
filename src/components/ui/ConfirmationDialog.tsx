import { useId, type ReactNode, type RefObject } from "react";
import { Button } from "./Button";
import { Dialog, type DialogSize } from "./Dialog";

export type ConfirmationIntent = "warning" | "destructive";

export interface ConfirmationDialogProps {
  open: boolean;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  cancelLabel?: string;
  intent?: ConfirmationIntent;
  size?: DialogSize;
  initialFocus?: RefObject<HTMLElement | null>;
}

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  cancelLabel = "Cancel",
  intent = "warning",
  size,
  initialFocus,
}: ConfirmationDialogProps) {
  const descriptionId = useId();

  return (
    <Dialog
      open={open}
      title={title}
      onClose={onCancel}
      size={size}
      initialFocus={initialFocus}
      descriptionId={descriptionId}
      actions={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={intent === "destructive" ? "danger" : "primary"} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p id={descriptionId}>{description}</p>
    </Dialog>
  );
}
