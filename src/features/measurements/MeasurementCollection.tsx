import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { MeasurementGroup } from "./MeasurementGroup";
import { MeasurementRow } from "./MeasurementRow";
import type { MeasurementGroup as MeasurementGroupModel } from "./measurementGrouping";
import type { MeasurementViewModel } from "./measurementViewModels";
import styles from "./MeasurementCollection.module.css";

export interface MeasurementCollectionProps {
  measurements: readonly (MeasurementViewModel & { selected: boolean })[];
  emptyMessage: string;
  onSelectMeasurement: (measurementId: string, additive?: boolean) => void;
  onToggleVisibility: (measurementId: string, visible: boolean) => void;
  groups?: readonly MeasurementGroupModel[];
  groupByDimensionId?: string | null;
  onSetMeasurementsVisibility?: (measurementIds: string[], visible: boolean) => void;
}

type MeasurementControl = "selection" | "visibility";
type RovingCell = { measurementId: string; control: MeasurementControl };

function findGroupPath(groups: readonly MeasurementGroupModel[], measurementId: string): string[] {
  for (const group of groups) {
    if (!group.measurementIds.includes(measurementId)) continue;
    return [group.key, ...findGroupPath(group.children ?? [], measurementId)];
  }
  return [];
}

function visibleGroupMeasurementIds(
  groups: readonly MeasurementGroupModel[],
  collapsedKeys: ReadonlySet<string>,
): string[] {
  return groups.flatMap((group) =>
    collapsedKeys.has(group.key)
      ? []
      : group.children
        ? visibleGroupMeasurementIds(group.children, collapsedKeys)
        : group.measurementIds,
  );
}

export function MeasurementCollection({
  measurements,
  emptyMessage,
  onSelectMeasurement,
  onToggleVisibility,
  groups,
  groupByDimensionId = null,
  onSetMeasurementsVisibility,
}: MeasurementCollectionProps) {
  const collectionRef = useRef<HTMLElement>(null);
  const pendingFocus = useRef<RovingCell | null>(null);
  const measurementsById = useMemo(
    () => new Map(measurements.map((measurement) => [measurement.id, measurement])),
    [measurements],
  );
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<Set<string>>(() => new Set());
  const selectedMeasurementId =
    measurements.find((measurement) => measurement.selected)?.id ?? null;
  const selectedGroupPath = selectedMeasurementId ? findGroupPath(groups ?? [], selectedMeasurementId) : [];
  const selectedGroupPathKey = selectedGroupPath.join("\u0000");
  const [rovingCell, setRovingCell] = useState<RovingCell | null>(() => {
    const initial = selectedMeasurementId ?? measurements[0]?.id;
    return initial ? { measurementId: initial, control: "selection" } : null;
  });
  const grouped = Boolean(groupByDimensionId && groups && onSetMeasurementsVisibility);
  const visibleMeasurementIds = grouped
    ? visibleGroupMeasurementIds(groups ?? [], collapsedGroupKeys)
    : measurements.map((measurement) => measurement.id);
  const visibleMeasurementIdSet = new Set(visibleMeasurementIds);
  const firstVisibleMeasurementId = visibleMeasurementIds.find((id) =>
    measurementsById.has(id),
  );
  const effectiveRovingCell =
    rovingCell &&
    visibleMeasurementIdSet.has(rovingCell.measurementId) &&
    measurementsById.has(rovingCell.measurementId)
      ? rovingCell
      : firstVisibleMeasurementId
        ? {
            measurementId:
              selectedMeasurementId && visibleMeasurementIdSet.has(selectedMeasurementId)
                ? selectedMeasurementId
                : firstVisibleMeasurementId,
            control: "selection" as const,
          }
        : null;

  function handleFocusCapture(event: FocusEvent<HTMLElement>) {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const measurementId = target?.dataset.measurementId;
    const control = target?.dataset.measurementControl as MeasurementControl | undefined;
    if (!measurementId || (control !== "selection" && control !== "visibility")) return;
    setRovingCell((current) =>
      current?.measurementId === measurementId && current.control === control
        ? current
        : { measurementId, control },
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const measurementId = target?.dataset.measurementId;
    const control = target?.dataset.measurementControl as MeasurementControl | undefined;
    if (!measurementId || (control !== "selection" && control !== "visibility")) return;
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;

    const orderedIds = visibleMeasurementIds;
    const rowIndex = orderedIds.indexOf(measurementId);
    if (rowIndex < 0) return;

    let nextId = measurementId;
    let nextControl = control;
    if (event.key === "ArrowLeft") nextControl = "selection";
    else if (event.key === "ArrowRight") nextControl = "visibility";
    else if (event.key === "Home") nextId = orderedIds[0] ?? measurementId;
    else if (event.key === "End") nextId = orderedIds.at(-1) ?? measurementId;
    else {
      const delta = event.key === "ArrowUp" ? -1 : 1;
      nextId = orderedIds[Math.max(0, Math.min(orderedIds.length - 1, rowIndex + delta))] ?? measurementId;
    }

    if (nextId === measurementId && nextControl === control) return;
    event.preventDefault();
    pendingFocus.current = { measurementId: nextId, control: nextControl };
    setRovingCell(pendingFocus.current);
  }

  useLayoutEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    const next = Array.from(collectionRef.current?.querySelectorAll<HTMLElement>(
      "[data-measurement-id][data-measurement-control]",
    ) ?? []).find((element) =>
      element.dataset.measurementId === pending.measurementId &&
      element.dataset.measurementControl === pending.control,
    );
    if (!next) return;
    pendingFocus.current = null;
    next.focus({ preventScroll: true });
    next.scrollIntoView?.({ block: "nearest" });
  });

  useEffect(() => {
    if (!selectedGroupPathKey) return;
    const selectedKeys = selectedGroupPathKey.split("\u0000");
    const frame = window.requestAnimationFrame(() => {
      setCollapsedGroupKeys((current) => {
        if (!selectedKeys.some((key) => current.has(key))) return current;
        const next = new Set(current);
        selectedKeys.forEach((key) => next.delete(key));
        return next;
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedMeasurementId, selectedGroupPathKey]);

  function toggleGroup(key: string) {
    setCollapsedGroupKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (measurements.length === 0) {
    return (
      <section className={styles.collection} aria-label="Measurement collection">
        <p className={styles.empty}>{emptyMessage}</p>
      </section>
    );
  }

  if (measurements.length > 100) {
    return (
      <section
        ref={collectionRef}
        className={styles.collection}
        aria-label="Measurement collection"
        onFocusCapture={handleFocusCapture}
        onKeyDown={handleKeyDown}
      >
        <VirtualCollectionContents
          measurements={measurements}
          measurementsById={measurementsById}
          groups={grouped ? groups : undefined}
          collapsedGroupKeys={collapsedGroupKeys}
          toggleGroup={toggleGroup}
          rovingCell={effectiveRovingCell}
          collectionRef={collectionRef}
          onSelectMeasurement={onSelectMeasurement}
          onToggleVisibility={onToggleVisibility}
          onSetMeasurementsVisibility={onSetMeasurementsVisibility}
        />
      </section>
    );
  }

  if (groupByDimensionId && groups && onSetMeasurementsVisibility) {
    function renderGroup(group: MeasurementGroupModel, depth = 0) {
      return (
        <MeasurementGroup
          key={group.key}
          group={group}
          depth={depth}
          measurements={group.children ? [] : group.measurementIds.flatMap((id) => {
            const measurement = measurementsById.get(id);
            return measurement ? [measurement] : [];
          })}
          collapsed={collapsedGroupKeys.has(group.key)}
          onToggleCollapsed={() => toggleGroup(group.key)}
          onSelectMeasurement={onSelectMeasurement}
          onToggleVisibility={onToggleVisibility}
          onSetMeasurementsVisibility={(measurementIds, visible) =>
            onSetMeasurementsVisibility?.(measurementIds, visible)
          }
          rovingCell={effectiveRovingCell}
        >
          {group.children?.map((child) => renderGroup(child, depth + 1))}
        </MeasurementGroup>
      );
    }
    return (
      <section
        ref={collectionRef}
        className={styles.collection}
        aria-label="Measurement collection"
        onFocusCapture={handleFocusCapture}
        onKeyDown={handleKeyDown}
      >
        <div className={styles.groups} aria-label="Measurements grouped by classification">
          {groups.map((group) => renderGroup(group))}
        </div>
      </section>
    );
  }

  return (
    <section
      ref={collectionRef}
      className={styles.collection}
      aria-label="Measurement collection"
      onFocusCapture={handleFocusCapture}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.list} role="list" aria-label="Measurements on current page">
        {measurements.map((measurement) => (
          <MeasurementRow
            key={measurement.id}
            viewModel={measurement}
            onSelectMeasurement={onSelectMeasurement}
            onToggleVisibility={onToggleVisibility}
            selectionTabIndex={
              effectiveRovingCell?.measurementId === measurement.id &&
              effectiveRovingCell.control === "selection"
                ? 0
                : -1
            }
            visibilityTabIndex={
              effectiveRovingCell?.measurementId === measurement.id &&
              effectiveRovingCell.control === "visibility"
                ? 0
                : -1
            }
          />
        ))}
      </div>
    </section>
  );
}

type CollectionMeasurement = MeasurementViewModel & { selected: boolean };
type VirtualEntry = { key: string; estimate: number; tabStops?: number };
type GroupRange = { start: number; end: number; rowsStart: number };

interface VirtualCollectionContentsProps {
  measurements: readonly CollectionMeasurement[];
  measurementsById: ReadonlyMap<string, CollectionMeasurement>;
  groups?: readonly MeasurementGroupModel[];
  collapsedGroupKeys: ReadonlySet<string>;
  toggleGroup: (key: string) => void;
  rovingCell: RovingCell | null;
  collectionRef: RefObject<HTMLElement | null>;
  onSelectMeasurement: MeasurementCollectionProps["onSelectMeasurement"];
  onToggleVisibility: MeasurementCollectionProps["onToggleVisibility"];
  onSetMeasurementsVisibility?: MeasurementCollectionProps["onSetMeasurementsVisibility"];
}

function VirtualCollectionContents({
  measurements,
  measurementsById,
  groups,
  collapsedGroupKeys,
  toggleGroup,
  rovingCell,
  collectionRef,
  onSelectMeasurement,
  onToggleVisibility,
  onSetMeasurementsVisibility,
}: VirtualCollectionContentsProps) {
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [viewport, setViewport] = useState({ top: 0, height: 640 });
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const pendingTabFocus = useRef<{ key: string; controlIndex: number } | null>(null);
  const { entries, groupRanges, entryIndexes } = useMemo(() => {
    const entries: VirtualEntry[] = [];
    const groupRanges = new Map<string, GroupRange>();
    function addRow(id: string) {
      if (measurementsById.has(id)) entries.push({ key: `row:${id}`, estimate: 49 });
    }
    function addGroup(group: MeasurementGroupModel, depth: number) {
      const start = entries.length;
      const onlyChild = group.children?.length === 1 ? group.children[0] : undefined;
      const scopeIds = new Set(group.measurementIds);
      const sameScope = onlyChild && group.measurementIds.length === onlyChild.measurementIds.length &&
        scopeIds.size === group.measurementIds.length &&
        new Set(onlyChild.measurementIds).size === onlyChild.measurementIds.length &&
        onlyChild.measurementIds.every((id) => scopeIds.has(id));
      entries.push({
        key: `header:${group.key}`,
        estimate: depth === 0 ? 41 : 32,
        tabStops: sameScope && !collapsedGroupKeys.has(group.key) ? 1 : 2,
      });
      const rowsStart = entries.length;
      if (!collapsedGroupKeys.has(group.key)) {
        if (group.children) group.children.forEach((child) => addGroup(child, depth + 1));
        else group.measurementIds.forEach(addRow);
      }
      groupRanges.set(group.key, { start, end: entries.length, rowsStart });
    }
    if (groups) groups.forEach((group) => addGroup(group, 0));
    else measurements.forEach((measurement) => addRow(measurement.id));
    return {
      entries,
      groupRanges,
      entryIndexes: new Map(entries.map((entry, index) => [entry.key, index])),
    };
  }, [collapsedGroupKeys, groups, measurements, measurementsById]);
  const offsets = useMemo(() => {
    const offsets = [0];
    for (const entry of entries) offsets.push(offsets[offsets.length - 1]! + (heights.get(entry.key) ?? entry.estimate));
    return offsets;
  }, [entries, heights]);

  useEffect(() => {
    const collection = collectionRef.current;
    if (!collection) return;
    function updateViewport() {
      setViewport((current) => {
        const next = { top: collection!.scrollTop, height: collection!.clientHeight || 640 };
        return next.top === current.top && next.height === current.height ? current : next;
      });
    }
    function focusIn(event: Event) {
      const element = event.target instanceof HTMLElement ? event.target : null;
      setFocusedKey(element?.closest<HTMLElement>("[data-virtual-key]")?.dataset.virtualKey ?? null);
    }
    function focusOut(event: FocusEvent) {
      if (!(event.relatedTarget instanceof Node) || !collection!.contains(event.relatedTarget)) setFocusedKey(null);
    }
    collection.addEventListener("scroll", updateViewport, { passive: true });
    collection.addEventListener("focusin", focusIn);
    collection.addEventListener("focusout", focusOut as unknown as EventListener);
    const frame = window.requestAnimationFrame(updateViewport);
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver((observations) => {
        updateViewport();
        setHeights((current) => {
          const next = new Map(current);
          let changed = false;
          for (const observation of observations) {
            const target = observation.target as HTMLElement;
            const key = target.dataset.virtualKey;
            const height = target.getBoundingClientRect().height;
            if (key && height > 0 && current.get(key) !== height) {
              next.set(key, height);
              changed = true;
            }
          }
          return changed ? next : current;
        });
      });
      observerRef.current = observer;
      observer.observe(collection);
      collection.querySelectorAll<HTMLElement>("[data-virtual-key]").forEach((element) => observer.observe(element));
    }
    return () => {
      window.cancelAnimationFrame(frame);
      collection.removeEventListener("scroll", updateViewport);
      collection.removeEventListener("focusin", focusIn);
      collection.removeEventListener("focusout", focusOut as unknown as EventListener);
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [collectionRef]);

  const measureRef = useCallback((element: HTMLElement | null) => {
    if (!element) return;
    observerRef.current?.observe(element);
    return () => observerRef.current?.unobserve(element);
  }, []);
  useLayoutEffect(() => {
    const pending = pendingTabFocus.current;
    if (!pending) return;
    const entry = Array.from(collectionRef.current?.querySelectorAll<HTMLElement>("[data-virtual-key]") ?? [])
      .find((element) => element.dataset.virtualKey === pending.key);
    const button = entry?.tagName === "HEADER"
      ? entry.querySelectorAll<HTMLButtonElement>("button")[pending.controlIndex]
      : entry?.querySelector<HTMLButtonElement>('button[tabindex="0"]');
    if (!button) return;
    pendingTabFocus.current = null;
    button.focus({ preventScroll: true });
    button.scrollIntoView?.({ block: "nearest" });
  });

  function handleVirtualTab(event: KeyboardEvent<HTMLElement>) {
    if (!groups || event.key !== "Tab") return;
    const target = event.target instanceof HTMLButtonElement ? event.target : null;
    const currentEntry = target?.closest<HTMLElement>("[data-virtual-key]");
    if (!target || !currentEntry) return;
    const currentIndex = currentEntry.tagName === "HEADER"
      ? Array.from(currentEntry.querySelectorAll("button")).indexOf(target)
      : 0;
    const tabStops = entries.flatMap((entry) => entry.tabStops !== undefined
      ? Array.from({ length: entry.tabStops }, (_, controlIndex) => ({ key: entry.key, controlIndex }))
      : entry.key === `row:${rovingCell?.measurementId}` ? [{ key: entry.key, controlIndex: 0 }] : []);
    const index = tabStops.findIndex((stop) => stop.key === currentEntry.dataset.virtualKey && stop.controlIndex === currentIndex);
    const next = tabStops[index + (event.shiftKey ? -1 : 1)];
    if (index < 0 || !next) return;
    event.preventDefault();
    if (next.key === currentEntry.dataset.virtualKey) {
      currentEntry.querySelectorAll<HTMLButtonElement>("button")[next.controlIndex]?.focus();
      return;
    }
    pendingTabFocus.current = next;
    setFocusedKey(next.key);
  }
  const overscan = 240;
  const windowTop = Math.max(0, viewport.top - overscan);
  const windowBottom = viewport.top + viewport.height + overscan;
  const pinnedIndexes = [focusedKey, rovingCell ? `row:${rovingCell.measurementId}` : null]
    .flatMap((key) => key && entryIndexes.has(key) ? [entryIndexes.get(key)!] : []);
  function intersects(start: number, end: number) {
    return (offsets[start]! < windowBottom && offsets[end]! > windowTop) ||
      pinnedIndexes.some((index) => index >= start && index < end);
  }
  function spacer(start: number, end: number, key: string) {
    return <div key={key} aria-hidden="true" style={{ height: offsets[end]! - offsets[start]! }} />;
  }
  function renderRows(ids: readonly string[], start: number): ReactNode[] {
    const validIds = ids.filter((id) => measurementsById.has(id));
    const result: ReactNode[] = [];
    let skippedStart = start;
    let index = start;
    validIds.forEach((id, position) => {
      if (intersects(index, index + 1)) {
        if (skippedStart < index) result.push(spacer(skippedStart, index, `before:${id}`));
        result.push(
          <MeasurementRow
            key={id}
            viewModel={measurementsById.get(id)!}
            onSelectMeasurement={onSelectMeasurement}
            onToggleVisibility={onToggleVisibility}
            selectionTabIndex={rovingCell?.measurementId === id && rovingCell.control === "selection" ? 0 : -1}
            visibilityTabIndex={rovingCell?.measurementId === id && rovingCell.control === "visibility" ? 0 : -1}
            positionInSet={position + 1}
            setSize={validIds.length}
            rowRef={measureRef}
            virtualKey={`row:${id}`}
          />,
        );
        skippedStart = index + 1;
      }
      index += 1;
    });
    if (skippedStart < index) result.push(spacer(skippedStart, index, "after"));
    return result;
  }
  function renderGroups(siblings: readonly MeasurementGroupModel[], depth = 0): ReactNode[] {
    const result: ReactNode[] = [];
    let skippedStart: number | null = null;
    let skippedEnd = 0;
    for (const group of siblings) {
      const range = groupRanges.get(group.key);
      if (!range) continue;
      if (!intersects(range.start, range.end)) {
        skippedStart ??= range.start;
        skippedEnd = range.end;
        continue;
      }
      if (skippedStart !== null) {
        result.push(spacer(skippedStart, skippedEnd, `before:${group.key}`));
        skippedStart = null;
      }
      const collapsed = collapsedGroupKeys.has(group.key);
      result.push(
        <MeasurementGroup
          key={group.key}
          group={group}
          depth={depth}
          measurements={[]}
          collapsed={collapsed}
          onToggleCollapsed={() => toggleGroup(group.key)}
          onSelectMeasurement={onSelectMeasurement}
          onToggleVisibility={onToggleVisibility}
          onSetMeasurementsVisibility={(ids, visible) => onSetMeasurementsVisibility?.(ids, visible)}
          rovingCell={rovingCell}
          headerRef={measureRef}
          headerKey={`header:${group.key}`}
          headerPlaceholderHeight={intersects(range.start, range.start + 1) ? undefined : offsets[range.start + 1]! - offsets[range.start]!}
          rowsContent={!collapsed && !group.children ? renderRows(group.measurementIds, range.rowsStart) : undefined}
        >
          {!collapsed && group.children ? renderGroups(group.children, depth + 1) : undefined}
        </MeasurementGroup>,
      );
    }
    if (skippedStart !== null) result.push(spacer(skippedStart, skippedEnd, "after"));
    return result;
  }
  return groups ? (
    <div className={styles.groups} aria-label="Measurements grouped by classification" onKeyDownCapture={handleVirtualTab}>
      {renderGroups(groups)}
    </div>
  ) : (
    <div className={styles.list} role="list" aria-label="Measurements on current page">
      {renderRows(measurements.map((measurement) => measurement.id), 0)}
    </div>
  );
}
