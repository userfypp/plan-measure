import { useLayoutEffect, useRef, useState } from "react";
import { Tooltip } from "../components/ui";
import { useRovingFocusGroup } from "../components/ui/rovingFocus";
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
  const toolbarRef = useRef<HTMLDivElement>(null);
  const toolbarFocus = useRovingFocusGroup(toolbarRef, {
    orientation: "vertical",
    itemSelector: "button[data-tool-id]",
    getDirectionalTarget: (current, direction, candidates) => {
      const toolId = current.dataset.toolId as ToolDefinition["id"] | undefined;
      if (!toolId) return null;
      const directionName = direction < 0 ? "up" : "down";
      let verticalNeighbor = getToolRailVerticalNeighbor(toolId, directionName);
      while (verticalNeighbor && verticalNeighbor !== toolId) {
        const neighbor = candidates.find(
          (candidate) => candidate.dataset.toolId === verticalNeighbor,
        );
        if (neighbor) return neighbor;
        verticalNeighbor = getToolRailVerticalNeighbor(verticalNeighbor, directionName);
      }
      return null;
    },
  });
  const returnFocusOnCloseRef = useRef(false);
  const previousIsNarrowRef = useRef(isNarrow);
  const toolFocusOwnedRef = useRef(false);
  const launcherFocusOwnedRef = useRef(false);
  const narrowOpen = isNarrow && narrowOpenVersion === narrowVersion;
  const toolbarId = "viewer-tools-narrow-toolbar";

  const closeNarrowTools = (returnFocus = true) => {
    returnFocusOnCloseRef.current = returnFocus;
    toolFocusOwnedRef.current = false;
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
  const currentRovingToolId = toolRailRegistry.some((definition) => definition.id === rovingToolId)
    ? rovingToolId
    : toolRailRegistry[0]?.id;

  useLayoutEffect(() => {
    if (!isNarrow || !narrowOpen) return;
    const toolbar = toolbarRef.current;
    const preferred = toolbar?.querySelector<HTMLButtonElement>(
      `button[data-tool-id="${currentRovingToolId}"]`,
    );
    const target = preferred ?? toolbar?.querySelector<HTMLButtonElement>("button[data-tool-id]");
    if (!target) return;
    setRovingToolId(target.dataset.toolId as ToolDefinition["id"]);
    target.focus({ preventScroll: true });
  }, [currentRovingToolId, isNarrow, narrowOpen, toolbarRef]);

  useLayoutEffect(() => {
    const wasNarrow = previousIsNarrowRef.current;
    previousIsNarrowRef.current = isNarrow;
    if (wasNarrow === isNarrow) return;

    if (isNarrow) {
      if (!toolFocusOwnedRef.current) return;
      toolFocusOwnedRef.current = false;
      launcherRef.current?.focus({ preventScroll: true });
      return;
    }

    if (!launcherFocusOwnedRef.current) return;
    launcherFocusOwnedRef.current = false;
    const toolbar = toolbarRef.current;
    const preferred = toolbar?.querySelector<HTMLButtonElement>(
      `button[data-tool-id="${currentRovingToolId}"]`,
    );
    const target = preferred ?? toolbar?.querySelector<HTMLButtonElement>("button[data-tool-id]");
    if (!target) return;
    setRovingToolId(target.dataset.toolId as ToolDefinition["id"]);
    target.focus({ preventScroll: true });
  }, [currentRovingToolId, isNarrow, toolbarRef]);

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
          onFocus={() => {
            launcherFocusOwnedRef.current = true;
          }}
          onBlur={() => {
            launcherFocusOwnedRef.current = false;
          }}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || !narrowOpen) return;
            event.preventDefault();
            closeNarrowTools(true);
          }}
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
        ref={toolbarRef}
        {...toolbarFocus}
        id={isNarrow ? toolbarId : undefined}
        className={styles.tools}
        role="toolbar"
        aria-label="Drawing tools"
        aria-orientation="vertical"
        onFocusCapture={(event) => {
          toolbarFocus.onFocusCapture(event);
          toolFocusOwnedRef.current = true;
        }}
        onBlurCapture={(event) => {
          const next = event.relatedTarget;
          if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
            toolFocusOwnedRef.current = false;
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && isNarrow) {
            event.preventDefault();
            closeNarrowTools(true);
            return;
          }
          toolbarFocus.onKeyDown(event);
        }}
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
              describeTrigger={!disabled}
            >
              <button
                type="button"
                className={[styles.toolButton, active ? styles.active : ""]
                  .filter(Boolean)
                  .join(" ")}
                aria-label={`${definition.label}${definition.shortcut ? `, shortcut ${definition.shortcut}` : ""}`}
                aria-pressed={active}
                aria-disabled={disabled || undefined}
                aria-describedby={disabled ? `tool-disabled-reason-${definition.id}` : undefined}
                aria-keyshortcuts={definition.shortcut?.toUpperCase()}
                data-tool-id={definition.id}
                data-disabled={disabled || undefined}
                tabIndex={currentRovingToolId === definition.id ? 0 : -1}
                title={disabled ? disabledReason : undefined}
                onFocus={() => setRovingToolId(definition.id)}
                onClick={(event) => {
                  if (disabled) {
                    event.preventDefault();
                    return;
                  }
                  if (!active) onChooseTool(tool);
                  if (isNarrow) closeNarrowTools(true);
                }}
              >
                <span className={styles.icon} aria-hidden="true">
                  <ToolIcon name={definition.icon} />
                </span>
                {disabled && (
                  <span id={`tool-disabled-reason-${definition.id}`} className={styles.visuallyHidden}>
                    {disabledReason}
                  </span>
                )}
              </button>
            </Tooltip>
          );
        })}
      </div>}
    </aside>
  );
}
