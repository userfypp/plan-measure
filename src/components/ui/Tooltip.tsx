import {
  cloneElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type RefObject,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  TOOLTIP_DELAY_MS,
  getAppPreferences,
  subscribeAppPreferences,
} from "../../utils/appPreferences";
import styles from "./Tooltip.module.css";

export type TooltipPosition = "top" | "right" | "bottom" | "left";

export interface TooltipProps {
  content: ReactNode;
  children: ReactElement;
  position?: TooltipPosition;
  /** Milliseconds before showing; defaults to the "Tooltip delay" preference. */
  delay?: number;
  describeTrigger?: boolean;
  /** Element the tooltip is placed against instead of the trigger (e.g. a whole wrapped label). */
  anchorRef?: RefObject<HTMLElement | null>;
  /** Keeps the bubble hidden (e.g. while the trigger's own popover is open). */
  suppressed?: boolean;
}

type DescribedTriggerProps = {
  "aria-describedby"?: string;
};

function matchesFocusVisible(target: EventTarget): boolean {
  try {
    return !(target instanceof Element) || target.matches(":focus-visible");
  } catch {
    return true;
  }
}

export function Tooltip({
  content,
  children,
  position = "top",
  delay,
  describeTrigger = true,
  anchorRef,
  suppressed = false,
}: TooltipProps) {
  const [hovered, setVisible] = useState(false);
  const [wasSuppressed, setWasSuppressed] = useState(suppressed);
  // Suppression ends a hover: the bubble must not pop back when the popover closes under the pointer.
  if (wasSuppressed !== suppressed) {
    setWasSuppressed(suppressed);
    if (suppressed) setVisible(false);
  }
  const visible = hovered && !suppressed;
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });
  // A modal dialog sits in the top layer: portal into it or the bubble would render beneath.
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();
  const readTooltipDelay = () => getAppPreferences().tooltipDelay;
  const tooltipDelay = useSyncExternalStore(
    subscribeAppPreferences,
    readTooltipDelay,
    readTooltipDelay,
  );
  const requestedDelay = delay ?? TOOLTIP_DELAY_MS[tooltipDelay];
  const normalizedDelay = Number.isFinite(requestedDelay) ? Math.max(0, requestedDelay) : 0;

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  // WCAG 1.4.13: a bubble covering content can be dismissed without moving the pointer or focus.
  useEffect(() => {
    if (!visible) return;
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.isComposing) setVisible(false);
    }
    document.addEventListener("keydown", dismissOnEscape);
    return () => document.removeEventListener("keydown", dismissOnEscape);
  }, [visible]);

  useLayoutEffect(() => {
    if (!visible) return;

    // A wrapped bubble keeps its max width even when the last line is short, leaving uneven
    // space around the text. Shrink it to the widest rendered line so the text sits centred.
    function fitToText() {
      const node = tooltipRef.current;
      if (!node || typeof document.createRange !== "function") return;
      node.style.width = "";
      const range = document.createRange();
      range.selectNodeContents(node);
      if (typeof range.getClientRects !== "function") return;
      const lines = Array.from(range.getClientRects());
      if (lines.length === 0) return;
      const textWidth = Math.max(...lines.map((line) => line.width));
      const style = window.getComputedStyle(node);
      // The bubble is border-box: its border counts too, or the last word wraps onto a new line.
      const chrome =
        parseFloat(style.paddingLeft) +
        parseFloat(style.paddingRight) +
        parseFloat(style.borderLeftWidth) +
        parseFloat(style.borderRightWidth);
      const fitted = Math.ceil(textWidth + chrome) + 1;
      const natural = node.getBoundingClientRect();
      if (!(fitted < natural.width)) return;
      node.style.width = `${fitted}px`;
      // Never trade a balanced bubble for a taller one: undo the fit if the text re-wraps.
      if (node.getBoundingClientRect().height > natural.height + 0.5) node.style.width = "";
    }

    function updateAnchor() {
      const rect = (anchorRef?.current ?? rootRef.current)?.getBoundingClientRect();
      const tooltip = tooltipRef.current?.getBoundingClientRect();
      if (!rect || !tooltip) return;
      let x = rect.left + (rect.width - tooltip.width) / 2;
      let y = rect.top - tooltip.height - 8;
      if (position === "right") {
        x = rect.right + 8;
        y = rect.top + (rect.height - tooltip.height) / 2;
      } else if (position === "bottom") {
        y = rect.bottom + 8;
      } else if (position === "left") {
        x = rect.left - tooltip.width - 8;
        y = rect.top + (rect.height - tooltip.height) / 2;
      }
      const width = document.documentElement.clientWidth || window.innerWidth;
      const height = document.documentElement.clientHeight || window.innerHeight;
      x = Math.max(8, Math.min(x, width - tooltip.width - 8));
      y = Math.max(8, Math.min(y, height - tooltip.height - 8));
      setAnchor((current) => (current.x === x && current.y === y ? current : { x, y }));
    }

    fitToText();
    updateAnchor();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateAnchor);
    if (rootRef.current) observer?.observe(rootRef.current);
    if (tooltipRef.current) observer?.observe(tooltipRef.current);
    window.addEventListener("resize", updateAnchor);
    window.addEventListener("scroll", updateAnchor, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateAnchor);
      window.removeEventListener("scroll", updateAnchor, true);
    };
  }, [anchorRef, content, position, visible]);

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function showTooltip() {
    clearTimer();
    setPortalHost(rootRef.current?.closest("dialog") ?? null);
    if (normalizedDelay === 0) {
      setVisible(true);
      return;
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setVisible(true);
    }, normalizedDelay);
  }

  function hideTooltip() {
    clearTimer();
    setVisible(false);
  }

  const describedTrigger = children as ReactElement<DescribedTriggerProps>;
  const existingDescribedBy = describedTrigger.props["aria-describedby"];
  const describedBy =
    [existingDescribedBy, describeTrigger && visible ? tooltipId : ""].filter(Boolean).join(" ") ||
    undefined;
  const trigger = cloneElement(describedTrigger, { "aria-describedby": describedBy });

  return (
    <span
      ref={rootRef}
      className={styles.root}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocusCapture={(event) => {
        // Programmatic focus (e.g. a dialog's initial focus) must not pin the tooltip open; some
        // browsers still report it as focus-visible, so the dialog marks its own focus move.
        if (event.target instanceof Element && event.target.closest("[data-initial-focus]")) return;
        if (!matchesFocusVisible(event.target)) return;
        showTooltip();
      }}
      onBlurCapture={hideTooltip}
    >
      {trigger}
      {visible &&
        createPortal(
          <span
            ref={tooltipRef}
            id={tooltipId}
            className={styles.content}
            role="tooltip"
            style={{ left: anchor.x, top: anchor.y }}
          >
            {content}
          </span>,
          portalHost ?? document.body,
        )}
    </span>
  );
}
