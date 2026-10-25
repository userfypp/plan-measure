import type { ReactNode } from "react";

/**
 * The shared glyph set: 20x20 viewBox, stroke only, `currentColor`. The owning control sets size,
 * stroke width and colour (`IconButton` does it for its icon), so a glyph never carries its own.
 */
function Icon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export interface IconProps {
  className?: string;
}

/** Back, previous level. */
export function ArrowLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M16 10H4.5M9.75 4.75 4.5 10l5.25 5.25" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m4.5 10.5 3.5 3.5 7.5-8" />
    </Icon>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m12 5-5 5 5 5" />
    </Icon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m8 5 5 5-5 5" />
    </Icon>
  );
}

/** Cancel, clear, dismiss. */
export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 5 10 10M15 5 5 15" />
    </Icon>
  );
}

/** Copy something to reuse elsewhere. */
export function CopyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="7" y="6" width="9" height="11" rx="1.5" />
      <path d="M12 6V4.5A1.5 1.5 0 0 0 10.5 3h-6A1.5 1.5 0 0 0 3 4.5v8A1.5 1.5 0 0 0 4.5 14H7" />
    </Icon>
  );
}

/** Move the points of a shape. */
export function EditPointsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.528 13.218 8.222 8.782M9.997 8.621l2.006 2.258M13.538 10.6l1.424-3.7" />
      <circle cx="4.75" cy="14.5" r="1.5" />
      <circle cx="9" cy="7.5" r="1.5" />
      <circle cx="13" cy="12" r="1.5" />
      <circle cx="15.5" cy="5.5" r="1.5" />
    </Icon>
  );
}

/** Look at something, reveal it. */
export function EyeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.08 10s2.71-4.38 7.92-4.38S17.92 10 17.92 10s-2.71 4.38-7.92 4.38S2.08 10 2.08 10Z" />
      <circle cx="10" cy="10" r="2.08" />
    </Icon>
  );
}

/** Bring something into the project. */
export function ImportIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 10h8M8.5 6.25 12.25 10 8.5 13.75M10.5 4h4.25a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H10.5" />
    </Icon>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 15.5l.75-3.25 8.5-8.5a1.41 1.41 0 0 1 2 0l1 1a1.41 1.41 0 0 1 0 2l-8.5 8.5-3.75.75zM12 5.5l2.5 2.5" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 10h10M10 5v10" />
    </Icon>
  );
}

/** Calibrate again. */
export function RefreshIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15.75 8A6 6 0 0 0 5 6.25M4.25 4v2.5h2.5M4.25 12A6 6 0 0 0 15 13.75M15.75 16v-2.5h-2.5" />
    </Icon>
  );
}

/** Give back something archived. */
export function RestoreIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 10a5.5 5.5 0 1 0 1.75-4M4.25 3.75V6.5H7M10 7v3l2 1.25" />
    </Icon>
  );
}

/** Set the drawing ratio: a small square scaling up to a larger one. */
export function RatioIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="9.5" width="7" height="7" rx="1" />
      <path d="M11 3.5h5.5V9M16.5 3.5 10.5 9.5" />
    </Icon>
  );
}

/** Check a scale against a known length: a filled marker above the middle of a ruler. */
export function ScaleCheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.75 3h6.5L10 8z" fill="currentColor" />
      <rect x="2.5" y="10.5" width="15" height="6" rx="1.5" />
      <path d="M6 10.5v2.5M9.25 10.5v1.75M12.5 10.5v2.5M15 10.5v1.75" />
    </Icon>
  );
}

export function SaveIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 5.25A1.25 1.25 0 0 1 5.25 4H13l3 3v7.75A1.25 1.25 0 0 1 14.75 16h-9.5A1.25 1.25 0 0 1 4 14.75ZM7 4v3.25h5V4M7 16v-4h6v4" />
    </Icon>
  );
}

/** A reusable layout. */
export function TemplatesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.25" y="3.75" width="13.5" height="12.5" rx="1.75" />
      <path d="M3.5 8h13M8 8v8" />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.25 5.5h13.5M7.75 5.5V4.25A1.25 1.25 0 0 1 9 3h2a1.25 1.25 0 0 1 1.25 1.25V5.5M5.25 5.5v10A1.75 1.75 0 0 0 7 17.25h6a1.75 1.75 0 0 0 1.75-1.75v-10M8.25 8.75v5M11.75 8.75v5" />
    </Icon>
  );
}
