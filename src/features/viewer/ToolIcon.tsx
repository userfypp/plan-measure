import type { ToolIconName } from "./toolRegistry";

interface ToolIconProps {
  name: ToolIconName;
}

const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  focusable: "false" as const,
};

export function ToolIcon({ name }: ToolIconProps) {
  switch (name) {
    case "select":
      return (
        <svg {...svgProps} aria-hidden="true">
          <path d="m5 3.5 11.8 8.85-5.35 1.45L9.4 19.2z" />
          <path d="m13.2 15.1 3.65 4.65" />
        </svg>
      );
    case "hand":
      return (
        <svg {...svgProps} aria-hidden="true">
          <path d="M7.5 12.5V8.1a1.45 1.45 0 0 1 2.9 0v3.35-5.1a1.45 1.45 0 0 1 2.9 0v5.1-4.05a1.45 1.45 0 0 1 2.9 0v4.35-2.15a1.45 1.45 0 0 1 1.8 0v4.25l.72-1.26a1.45 1.45 0 0 1 2.52 1.42l-2.45 4.33a4.65 4.65 0 0 1-4.05 2.35h-2.35a4.95 4.95 0 0 1-4.95-4.95v-3.25a1.45 1.45 0 0 1 2.9 0" />
        </svg>
      );
    case "line":
      return (
        <svg {...svgProps} aria-hidden="true">
          <circle cx="5" cy="18" r="1.75" />
          <circle cx="19" cy="6" r="1.75" />
          <path d="m6.35 16.85 11.3-9.7" />
        </svg>
      );
    case "polyline":
      return (
        <svg {...svgProps} aria-hidden="true">
          <path d="m4.5 17 5.5-10 10 8" />
          <circle cx="4.5" cy="17" r="1.45" />
          <circle cx="10" cy="7" r="1.45" />
          <circle cx="20" cy="15" r="1.45" />
        </svg>
      );
    case "polygon":
      return (
        <svg {...svgProps} aria-hidden="true">
          <path d="m5 6.5 9.5-2 5 6.8-4.5 8-10-3.1Z" />
          <circle cx="5" cy="6.5" r="1" />
          <circle cx="14.5" cy="4.5" r="1" />
          <circle cx="19.5" cy="11.3" r="1" />
          <circle cx="15" cy="19.3" r="1" />
          <circle cx="5" cy="16.2" r="1" />
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
          <path d="M5 5v14h14" />
          <path d="M9 15h6V9" />
        </svg>
      );
    case "snap":
      return (
        <svg {...svgProps} aria-hidden="true">
          <circle cx="17.5" cy="6.5" r="2" />
          <path d="m4.5 18 7.8-7.8M8.5 10.2h3.8V14" />
        </svg>
      );
  }
}
