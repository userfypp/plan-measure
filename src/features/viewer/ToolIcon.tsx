import type { ToolIconName } from "./toolRegistry";

interface ToolIconProps {
  name: ToolIconName;
}

const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  focusable: "false" as const,
};

export function ToolIcon({ name }: ToolIconProps) {
  switch (name) {
    case "select":
      return (
        <svg {...svgProps} aria-hidden="true">
          <path d="M5.25 3.5 18.5 11.7l-5.7 1.2 2.9 5.75-2.35 1.15-2.85-5.7-5.25 4.65V3.5Z" />
        </svg>
      );
    case "hand":
      return (
        <svg {...svgProps} viewBox="4 4 56 56" strokeWidth={4.25} aria-hidden="true">
          <path d="M23 34.5 18.4 30.7c-1.9-1.6-4.7-1.4-6.4.4-1.7 1.8-1.5 4.6.4 6.2l11.1 9.9c3.3 2.9 7.5 4.5 11.9 4.5C44.6 51.7 52 44.3 52 35.1V21.5c0-2.3-1.4-4-3.1-4s-3.1 1.7-3.1 4v4.7c0 1-.3 1.6-.7 1.6s-.7-.6-.7-1.2V17c0-2.3-1.4-4-3.1-4s-3.1 1.7-3.1 4v8.5c0 1-.3 1.6-.7 1.6s-.7-.6-.7-1.2V14c0-2.3-1.4-4-3.1-4s-3.1 1.7-3.1 4v10.8c0 1-.3 1.6-.7 1.6s-.7-.6-.7-1.2V20c0-2.3-1.4-4-3.1-4s-3.1 1.7-3.1 4v14.5Z" />
        </svg>
      );
    case "line":
      return (
        <svg {...svgProps} aria-hidden="true">
          <path d="M5.5 18.5 18.5 5.5" />
          <circle cx="5.5" cy="18.5" r="1.5" fill="var(--color-surface)" />
          <circle cx="18.5" cy="5.5" r="1.5" fill="var(--color-surface)" />
        </svg>
      );
    case "polyline":
      return (
        <svg {...svgProps} aria-hidden="true">
          <polyline points="4.5 18 9 7 14 12.5 19.5 5" />
          <circle cx="4.5" cy="18" r="1.25" fill="var(--color-surface)" />
          <circle cx="9" cy="7" r="1.25" fill="var(--color-surface)" />
          <circle cx="14" cy="12.5" r="1.25" fill="var(--color-surface)" />
          <circle cx="19.5" cy="5" r="1.25" fill="var(--color-surface)" />
        </svg>
      );
    case "polygon":
      return (
        <svg {...svgProps} aria-hidden="true">
          <polygon points="5 7 15 4.5 19.5 13 12 19.5 4.5 15" />
          <circle cx="5" cy="7" r="1.25" fill="var(--color-surface)" />
          <circle cx="15" cy="4.5" r="1.25" fill="var(--color-surface)" />
          <circle cx="19.5" cy="13" r="1.25" fill="var(--color-surface)" />
          <circle cx="12" cy="19.5" r="1.25" fill="var(--color-surface)" />
          <circle cx="4.5" cy="15" r="1.25" fill="var(--color-surface)" />
        </svg>
      );
    case "calibrate":
      return (
        <svg {...svgProps} aria-hidden="true">
          <path d="m5 17 12-12 2 2L7 19H5v-2Z" />
          <path d="m9 13 2 2m1-5 2 2m1-5 2 2" />
        </svg>
      );
    case "orthogonal":
      return (
        <svg {...svgProps} aria-hidden="true">
          <path d="M5 19V6h13" />
          <path d="M9 15h5V10" />
          <circle cx="5" cy="19" r="1.25" fill="var(--color-surface)" />
          <circle cx="18" cy="6" r="1.25" fill="var(--color-surface)" />
        </svg>
      );
  }
}
