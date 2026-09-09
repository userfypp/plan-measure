import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type AriaRole,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import styles from "./Popover.module.css";

const VIEWPORT_MARGIN_PX = 8;
const POPOVER_GAP_PX = 4;
const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"]):not([disabled])',
].join(", ");

type PopoverDismissReason = "escape" | "outside";

interface PopoverLayer {
  id: string;
  parentId: string | null;
  contains: (target: Node) => boolean;
  dismiss: (reason: PopoverDismissReason) => void;
}

const popoverLayers: PopoverLayer[] = [];
const PopoverLayerContext = createContext<string | null>(null);

function topPopoverLayer(): PopoverLayer | undefined {
  return popoverLayers.at(-1);
}

function handlePopoverPointerDown(event: PointerEvent) {
  const layer = topPopoverLayer();
  const target = event.target;
  if (!layer || !(target instanceof Node) || layer.contains(target)) return;
  layer.dismiss("outside");
}

function handlePopoverKeyDown(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  const layer = topPopoverLayer();
  if (!layer) return;
  event.preventDefault();
  layer.dismiss("escape");
}

function registerPopoverLayer(layer: PopoverLayer): () => void {
  const firstChildIndex = popoverLayers.findIndex((candidate) => candidate.parentId === layer.id);
  if (firstChildIndex >= 0) popoverLayers.splice(firstChildIndex, 0, layer);
  else popoverLayers.push(layer);
  if (popoverLayers.length === 1) {
    document.addEventListener("pointerdown", handlePopoverPointerDown, true);
    document.addEventListener("keydown", handlePopoverKeyDown, true);
  }

  return () => {
    const index = popoverLayers.findIndex((candidate) => candidate.id === layer.id);
    if (index >= 0) popoverLayers.splice(index, 1);
    if (popoverLayers.length === 0) {
      document.removeEventListener("pointerdown", handlePopoverPointerDown, true);
      document.removeEventListener("keydown", handlePopoverKeyDown, true);
    }
  };
}

export function focusPopoverContentElement(element: HTMLElement | null | undefined) {
  if (!element) return;
  element.focus({ preventScroll: true });
  element.scrollIntoView?.({ block: "nearest", inline: "nearest" });
}

export type PopoverPlacement = "bottom-start" | "bottom-end";
export type PopoverInitialFocus = "none" | "first" | "container";

export type PopoverTriggerProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "type" | "aria-expanded" | "aria-controls"
>;

interface PopoverBaseProps {
  trigger: ReactNode;
  triggerProps?: PopoverTriggerProps;
  children: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  placement?: PopoverPlacement;
  initialFocus?: PopoverInitialFocus;
  className?: string;
}

type PopoverSemanticProps =
  | {
      role?: undefined;
      "aria-label"?: never;
      "aria-labelledby"?: never;
    }
  | {
      role: AriaRole;
      "aria-label": string;
      "aria-labelledby"?: never;
    }
  | {
      role: AriaRole;
      "aria-label"?: never;
      "aria-labelledby": string;
    };

export type PopoverProps = PopoverBaseProps & PopoverSemanticProps;

interface PopoverPosition {
  left: number;
  top: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function Popover({
  trigger,
  triggerProps,
  children,
  open,
  defaultOpen = false,
  onOpenChange,
  placement = "bottom-start",
  initialFocus = "first",
  role,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  className,
}: PopoverProps) {
  const parentLayerId = useContext(PopoverLayerContext);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isOpen = open ?? uncontrolledOpen;
  const anchorRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  const outsideDismissRef = useRef(false);
  const dismissRef = useRef<(reason: PopoverDismissReason) => void>(() => undefined);
  const popoverId = useId();
  const [position, setPosition] = useState<PopoverPosition>({ left: 0, top: 0 });

  function setOpen(nextOpen: boolean, outsideDismiss = false) {
    outsideDismissRef.current = outsideDismiss;
    if (open === undefined) setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }

  useLayoutEffect(() => {
    dismissRef.current = (reason) => setOpen(false, reason === "outside");
  });

  useLayoutEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      return;
    }
    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    if (!outsideDismissRef.current) anchorRef.current?.focus({ preventScroll: true });
    outsideDismissRef.current = false;
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) return;

    function updatePosition() {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const content = contentRef.current?.getBoundingClientRect();
      if (!anchor || !content) return;

      const preferredLeft =
        placement === "bottom-end" ? anchor.right - content.width : anchor.left;
      const left = clamp(
        preferredLeft,
        VIEWPORT_MARGIN_PX,
        window.innerWidth - content.width - VIEWPORT_MARGIN_PX,
      );
      const below = anchor.bottom + POPOVER_GAP_PX;
      const above = anchor.top - content.height - POPOVER_GAP_PX;
      const preferredTop =
        below + content.height <= window.innerHeight - VIEWPORT_MARGIN_PX ||
        above < VIEWPORT_MARGIN_PX
          ? below
          : above;
      const top = clamp(
        preferredTop,
        VIEWPORT_MARGIN_PX,
        window.innerHeight - content.height - VIEWPORT_MARGIN_PX,
      );
      setPosition({ left, top });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, placement]);

  useLayoutEffect(() => {
    if (!isOpen || initialFocus === "none") return;
    const content = contentRef.current;
    if (!content) return;
    if (initialFocus === "container") {
      focusPopoverContentElement(content);
      return;
    }
    const requested = content.querySelector<HTMLElement>('[data-popover-autofocus="true"]');
    const first = requested ?? content.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    focusPopoverContentElement(first);
  }, [initialFocus, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    return registerPopoverLayer({
      id: popoverId,
      parentId: parentLayerId,
      contains: (target) =>
        Boolean(anchorRef.current?.contains(target) || contentRef.current?.contains(target)),
      dismiss: (reason) => dismissRef.current(reason),
    });
  }, [isOpen, parentLayerId, popoverId]);

  const { onClick: originalOnClick, className: triggerClassName, ...buttonProps } =
    triggerProps ?? {};

  return (
    <>
      <button
        ref={anchorRef}
        {...buttonProps}
        type="button"
        className={[styles.trigger, triggerClassName].filter(Boolean).join(" ")}
        aria-expanded={isOpen}
        aria-controls={isOpen ? popoverId : undefined}
        onClick={(event) => {
          originalOnClick?.(event);
          if (!event.defaultPrevented) setOpen(!isOpen);
        }}
      >
        {trigger}
      </button>
      {isOpen &&
        createPortal(
          <PopoverLayerContext.Provider value={popoverId}>
            <div
              ref={contentRef}
              id={popoverId}
              role={role}
              aria-label={ariaLabel}
              aria-labelledby={ariaLabelledBy}
              tabIndex={initialFocus === "container" ? -1 : undefined}
              className={[styles.content, className].filter(Boolean).join(" ")}
              style={position}
            >
              {children}
            </div>
          </PopoverLayerContext.Provider>,
          document.body,
        )}
    </>
  );
}
