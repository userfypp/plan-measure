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
}

type DescribedTriggerProps = {
  "aria-describedby"?: string;
};

export function Tooltip({ content, children, position = "top", delay = 300 }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });
  const timerRef = useRef<number | null>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
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
      if (!rect) return;
      if (position === "top") setAnchor({ x: rect.left + rect.width / 2, y: rect.top - 8 });
      else if (position === "right") setAnchor({ x: rect.right + 8, y: rect.top + rect.height / 2 });
      else if (position === "bottom") setAnchor({ x: rect.left + rect.width / 2, y: rect.bottom + 8 });
      else setAnchor({ x: rect.left - 8, y: rect.top + rect.height / 2 });
    }

    updateAnchor();
    window.addEventListener("resize", updateAnchor);
    window.addEventListener("scroll", updateAnchor, true);
    return () => {
      window.removeEventListener("resize", updateAnchor);
      window.removeEventListener("scroll", updateAnchor, true);
    };
  }, [position, visible]);

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
    [existingDescribedBy, visible ? tooltipId : ""].filter(Boolean).join(" ") || undefined;
  const trigger = cloneElement(describedTrigger, { "aria-describedby": describedBy });

  return (
    <span
      ref={rootRef}
      className={[styles.root, styles[position]].join(" ")}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocusCapture={showTooltip}
      onBlurCapture={hideTooltip}
    >
      {trigger}
      {visible &&
        createPortal(
          <span
            id={tooltipId}
            className={[styles.content, styles[position]].join(" ")}
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
