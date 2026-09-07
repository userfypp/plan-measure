import { useState, type KeyboardEvent } from "react";
import { Tooltip } from "../components/ui";
import { ToolIcon } from "../features/viewer/ToolIcon";
import {
  getToolAvailabilityState,
  getToolRailVerticalNeighbor,
  toolRailRegistry,
  type ToolAvailabilityMap,
  type ToolDefinition,
} from "../features/viewer/toolRegistry";
import { useWorkspaceState } from "./workspaceState";
import styles from "./ToolRail.module.css";

type DrawingAid = "orthogonal" | "snap";
type RailTool = Exclude<ToolDefinition["id"], DrawingAid>;

interface ToolRailProps {
  toolAvailability: ToolAvailabilityMap;
  onChooseTool: (tool: RailTool) => void;
}

export function ToolRail({ toolAvailability, onChooseTool }: ToolRailProps) {
  const { activeTool, orthogonal, snap, toggleOrthogonal, toggleSnap } = useWorkspaceState();
  const [rovingToolId, setRovingToolId] = useState<ToolDefinition["id"]>("select");
  const focusedToolIsAvailable = toolRailRegistry.some(
    (definition) =>
      definition.id === rovingToolId &&
      !getToolAvailabilityState(definition, toolAvailability).disabled,
  );
  const currentRovingToolId = focusedToolIsAvailable ? rovingToolId : "select";

  function handleToolbarKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const horizontalStep = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : null;
    const isVerticalNavigation = event.key === "ArrowUp" || event.key === "ArrowDown";
    const isBoundaryNavigation = event.key === "Home" || event.key === "End";
    if (horizontalStep === null && !isVerticalNavigation && !isBoundaryNavigation) return;

    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-tool-id]"),
    );
    const navigableButtons = buttons.filter((button) => !button.disabled);
    if (navigableButtons.length === 0) return;

    const currentIndex = buttons.findIndex((button) => button === document.activeElement);
    const activeIndex = currentIndex >= 0 ? currentIndex : buttons.indexOf(navigableButtons[0]!);
    let nextButton =
      event.key === "Home"
        ? navigableButtons[0]
        : event.key === "End"
          ? navigableButtons[navigableButtons.length - 1]
          : undefined;

    if (!nextButton && isVerticalNavigation) {
      const activeToolId = buttons[activeIndex]?.dataset.toolId as ToolDefinition["id"] | undefined;
      if (activeToolId) {
        let verticalNeighbor = getToolRailVerticalNeighbor(
          activeToolId,
          event.key === "ArrowUp" ? "up" : "down",
        );
        while (verticalNeighbor && verticalNeighbor !== activeToolId) {
          const neighborButton = buttons.find(
            (button) => button.dataset.toolId === verticalNeighbor,
          );
          if (neighborButton && !neighborButton.disabled) {
            nextButton = neighborButton;
            break;
          }
          verticalNeighbor = getToolRailVerticalNeighbor(
            verticalNeighbor,
            event.key === "ArrowUp" ? "up" : "down",
          );
        }
      }
    }

    if (!nextButton && horizontalStep !== null) {
      let nextIndex = activeIndex;
      do {
        nextIndex = (nextIndex + horizontalStep + buttons.length) % buttons.length;
      } while (buttons[nextIndex]?.disabled && nextIndex !== activeIndex);
      nextButton = buttons[nextIndex];
    }

    if (!nextButton) return;
    event.preventDefault();
    setRovingToolId(nextButton.dataset.toolId as ToolDefinition["id"]);
    nextButton.focus();
  }

  return (
    <aside className={styles.toolRail} aria-label="Viewer tools" data-layout-slot="tool-rail">
      <div
        className={styles.tools}
        role="toolbar"
        aria-label="Drawing tools"
        onKeyDown={handleToolbarKeyDown}
      >
        {toolRailRegistry.map((definition) => {
          const isOrthogonal = definition.id === "orthogonal";
          const isSnap = definition.id === "snap";
          const isDrawingAid = isOrthogonal || isSnap;
          const tool = isDrawingAid ? null : (definition.id as RailTool);
          const { disabled, disabledReason } = getToolAvailabilityState(
            definition,
            toolAvailability,
          );
          const active = isOrthogonal ? orthogonal : isSnap ? snap : activeTool === tool;
          const shortcut = definition.shortcut ? ` (${definition.shortcut})` : "";

          return (
            <Tooltip
              key={definition.id}
              content={`${disabled ? disabledReason : definition.description}${shortcut}`}
              position="right"
            >
              <button
                type="button"
                className={[styles.toolButton, active ? styles.active : ""]
                  .filter(Boolean)
                  .join(" ")}
                aria-label={`${definition.label}${definition.shortcut ? `, shortcut ${definition.shortcut}` : ""}`}
                aria-pressed={active}
                aria-keyshortcuts={definition.shortcut?.toUpperCase()}
                data-tool-id={definition.id}
                tabIndex={currentRovingToolId === definition.id ? 0 : -1}
                title={disabled ? disabledReason : undefined}
                disabled={disabled}
                onFocus={() => setRovingToolId(definition.id)}
                onClick={() => {
                  if (isOrthogonal) {
                    toggleOrthogonal();
                  } else if (isSnap) {
                    toggleSnap();
                  } else if (tool) {
                    if (!active) onChooseTool(tool);
                  }
                }}
              >
                <span className={styles.icon} aria-hidden="true">
                  <ToolIcon name={definition.icon} />
                </span>
                <span className={styles.label}>{definition.label}</span>
                {definition.shortcut && (
                  <kbd className={styles.shortcut}>{definition.shortcut}</kbd>
                )}
              </button>
            </Tooltip>
          );
        })}
      </div>
    </aside>
  );
}
