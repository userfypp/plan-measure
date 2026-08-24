import { useState, type KeyboardEvent } from "react";
import { Tooltip } from "../components/ui";
import { ToolIcon } from "../features/viewer/ToolIcon";
import {
  getToolAvailabilityState,
  toolRailRegistry,
  type ToolAvailabilityMap,
  type ToolDefinition,
} from "../features/viewer/toolRegistry";
import { useWorkspaceState } from "./workspaceState";
import styles from "./ToolRail.module.css";

type RailTool = Exclude<ToolDefinition["id"], "orthogonal">;

interface ToolRailProps {
  toolAvailability: ToolAvailabilityMap;
  onChooseTool: (tool: RailTool) => void;
}

export function ToolRail({ toolAvailability, onChooseTool }: ToolRailProps) {
  const { activeTool, orthogonal, toggleOrthogonal } = useWorkspaceState();
  const [rovingToolId, setRovingToolId] = useState<ToolDefinition["id"]>("select");
  const focusedToolIsAvailable = toolRailRegistry.some((definition) =>
    definition.id === rovingToolId &&
    !getToolAvailabilityState(definition, toolAvailability).disabled,
  );
  const currentRovingToolId = focusedToolIsAvailable ? rovingToolId : "select";

  function handleToolbarKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-tool-id]:not(:disabled)"),
    );
    if (buttons.length === 0) return;
    const currentIndex = buttons.findIndex((button) => button === document.activeElement);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : event.key === "ArrowUp"
          ? (currentIndex - 1 + buttons.length) % buttons.length
          : (currentIndex + 1) % buttons.length;
    const nextButton = buttons[nextIndex];
    if (!nextButton) return;
    event.preventDefault();
    setRovingToolId(nextButton.dataset.toolId as ToolDefinition["id"]);
    nextButton.focus();
  }

  return (
    <aside className={styles.toolRail} aria-label="Viewer tools" data-layout-slot="tool-rail">
      <div className={styles.header}>
        <span className={styles.eyebrow}>Tools</span>
      </div>
      <div
        className={styles.tools}
        role="toolbar"
        aria-label="Drawing tools"
        aria-orientation="vertical"
        onKeyDown={handleToolbarKeyDown}
      >
        {toolRailRegistry.map((definition) => {
          const isOrthogonal = definition.id === "orthogonal";
          const tool = isOrthogonal ? null : (definition.id as RailTool);
          const { disabled, disabledReason } = getToolAvailabilityState(
            definition,
            toolAvailability,
          );
          const active = isOrthogonal ? orthogonal : activeTool === tool;
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
