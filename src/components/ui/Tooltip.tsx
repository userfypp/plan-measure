import {
  cloneElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import styles from "./Tooltip.module.css";

export type TooltipPosition = "top" | "right" | "bottom" | "left";

export interface TooltipProps {
  content: ReactNode;
  children: ReactElement;
  position?: TooltipPosition;
  delay?: number;
  describeTrigger?: boolean;
}

type DescribedTriggerProps = {
  "aria-describedby"?: string;
};

export function Tooltip({
  content,
  children,
  position = "top",
  delay = 300,
  describeTrigger = true,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });
  const timerRef = useRef<number | null>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();
  const normalizedDelay = Number.isFinite(delay) ? Math.max(0, delay) : 0;

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (!visible) return;

    function updateAnchor() {
      const rect = rootRef.current?.getBoundingClientRect();
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
  }, [content, position, visible]);

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function showTooltip() {
    clearTimer();
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
      onFocusCapture={showTooltip}
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
          document.body,
        )}
    </span>
  );
}
