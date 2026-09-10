import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Tooltip } from "../components/ui";
import { ToolIcon } from "../features/viewer/ToolIcon";
import {
  getToolAvailabilityState,
  getToolRailVerticalNeighbor,
  toolRailRegistry,
  type ToolAvailabilityMap,
  type ToolDefinition,
} from "../features/viewer/toolRegistry";
import type { Tool } from "../types/domain";
import { isMeasurementType } from "../utils/geometry";
import { useAuthoringCapability } from "../features/viewer/AuthoringCapability";
import { useWorkspaceDrawerPresentation } from "./WorkspaceDrawerContext";
import { useWorkspaceState } from "./workspaceState";
import styles from "./ToolRail.module.css";

type PrimaryTool = Exclude<Tool, "calibrate">;

interface ToolRailProps {
  toolAvailability: ToolAvailabilityMap;
  onChooseTool: (tool: PrimaryTool) => void;
}

export function ToolRail({ toolAvailability, onChooseTool }: ToolRailProps) {
  const { activeTool } = useWorkspaceState();
  const capability = useAuthoringCapability();
  const { isNarrow, narrowVersion } = useWorkspaceDrawerPresentation();
  const [rovingToolId, setRovingToolId] = useState<ToolDefinition["id"]>("select");
  const [narrowOpenVersion, setNarrowOpenVersion] = useState<number | null>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const returnFocusOnCloseRef = useRef(false);
  const narrowOpen = isNarrow && narrowOpenVersion === narrowVersion;
  const toolbarId = "viewer-tools-narrow-toolbar";

  const closeNarrowTools = (returnFocus = true) => {
    returnFocusOnCloseRef.current = returnFocus;
    setNarrowOpenVersion(null);
  };

  useLayoutEffect(() => {
    if (narrowOpen || !returnFocusOnCloseRef.current) return;
    returnFocusOnCloseRef.current = false;
    if (isNarrow) launcherRef.current?.focus({ preventScroll: true });
  }, [isNarrow, narrowOpen]);
  const availabilityFor = (definition: ToolDefinition) => {
    const base = getToolAvailabilityState(definition, toolAvailability);
    if (
      !base.disabled &&
      !capability.available &&
      isMeasurementType(definition.id)
    ) {
      return {
        disabled: true,
        disabledReason:
          capability.unavailableReason ??
          "Precision drawing is available after the Viewer geometry is measured.",
      };
    }
    return base;
  };
  const focusedToolIsAvailable = toolRailRegistry.some(
    (definition) =>
      definition.id === rovingToolId && !availabilityFor(definition).disabled,
  );
  const currentRovingToolId = focusedToolIsAvailable ? rovingToolId : "select";

  function handleToolbarKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const previousKey = "ArrowUp";
    const nextKey = "ArrowDown";
    const isDirectionalNavigation = event.key === previousKey || event.key === nextKey;
    const isBoundaryNavigation = event.key === "Home" || event.key === "End";
    if (event.key === "Escape" && isNarrow) {
      event.preventDefault();
      closeNarrowTools(true);
      return;
    }
    if (!isDirectionalNavigation && !isBoundaryNavigation) return;

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

    if (!nextButton && isDirectionalNavigation) {
      const activeToolId = buttons[activeIndex]?.dataset.toolId as ToolDefinition["id"] | undefined;
      if (activeToolId) {
        let verticalNeighbor = getToolRailVerticalNeighbor(
          activeToolId,
          event.key === previousKey ? "up" : "down",
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
            event.key === previousKey ? "up" : "down",
          );
        }
      }
    }

    if (!nextButton) return;
    event.preventDefault();
    setRovingToolId(nextButton.dataset.toolId as ToolDefinition["id"]);
    nextButton.focus();
  }

  return (
    <aside
      className={[styles.toolRail, isNarrow ? styles.narrow : ""].filter(Boolean).join(" ")}
      aria-label="Viewer tools"
      data-layout-slot="tool-rail"
    >
      {isNarrow && (
        <button
          ref={launcherRef}
          type="button"
          className={styles.launcher}
          aria-label="Tools"
          aria-controls={toolbarId}
          aria-expanded={narrowOpen}
          title="Tools"
          onClick={() => {
            if (narrowOpen) closeNarrowTools(false);
            else setNarrowOpenVersion(narrowVersion);
          }}
        >
          <span className={styles.icon} aria-hidden="true">
            <ToolIcon name="select" />
          </span>
        </button>
      )}
      {(!isNarrow || narrowOpen) && <div
        id={isNarrow ? toolbarId : undefined}
        className={styles.tools}
        role="toolbar"
        aria-label="Drawing tools"
        aria-orientation="vertical"
        onKeyDown={handleToolbarKeyDown}
      >
        {toolRailRegistry.map((definition) => {
          const tool = definition.id as PrimaryTool;
          const { disabled, disabledReason } = availabilityFor(definition);
          const active = activeTool === tool;
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
                  if (!active) onChooseTool(tool);
                  if (isNarrow) closeNarrowTools(true);
                }}
              >
                <span className={styles.icon} aria-hidden="true">
                  <ToolIcon name={definition.icon} />
                </span>
              </button>
            </Tooltip>
          );
        })}
      </div>}
    </aside>
  );
}
