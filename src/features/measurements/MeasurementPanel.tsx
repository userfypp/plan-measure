import { useState } from "react";
import { useSessionState } from "../../app/sessionState";
import { useWorkspaceState } from "../../app/workspaceState";
import type { PageState } from "../../types/domain";
import { MeasurementCollection } from "./MeasurementCollection";
import { MeasurementsHeader } from "./MeasurementsHeader";
import { createMeasurementGroups } from "./measurementGrouping";
import { getMeasurementEmptyMessage, createMeasurementViewModels } from "./measurementViewModels";
import styles from "./MeasurementPanel.module.css";

export interface MeasurementDeleteRequest {
  pageNumber: number;
  measurementId: string;
  measurementName: string;
}

export interface MeasurementPanelProps {
  page: PageState;
  onSelectMeasurement: (measurementId: string) => void;
  onSetMeasurementVisibility: (pageNumber: number, measurementId: string, visible: boolean) => void;
  onSetMeasurementsVisibility: (
    pageNumber: number,
    measurementIds: string[],
    visible: boolean,
  ) => void;
}

export function MeasurementPanel({
  page,
  onSelectMeasurement,
  onSetMeasurementVisibility,
  onSetMeasurementsVisibility,
}: MeasurementPanelProps) {
  const { session } = useSessionState();
  const { selectedMeasurementId } = useWorkspaceState();
  const displayUnit = session?.settings.displayUnit ?? "m";
  const measurementDecimalPlaces = session?.settings.measurementDecimalPlaces ?? 2;
  const areaDisplay = session?.settings.areaDisplay ?? "auto";
  const [groupByDimensionIds, setGroupByDimensionIds] = useState<string[]>([]);
  const measurements = createMeasurementViewModels(
    page,
    displayUnit,
    selectedMeasurementId,
    measurementDecimalPlaces,
    areaDisplay,
  );
  const catalog = session?.classificationCatalog ?? { dimensions: [] };
  const hasGroupBy = catalog.dimensions.length > 0;
  const groups = groupByDimensionIds.length
    ? createMeasurementGroups(page.measurements, catalog, groupByDimensionIds)
    : undefined;

  return (
    <aside
      className={[styles.panel, hasGroupBy ? "" : styles.withoutGroupBy].filter(Boolean).join(" ")}
      aria-label="Measurements on current page"
    >
      {hasGroupBy && (
        <MeasurementsHeader
          dimensions={catalog.dimensions}
          groupByDimensionIds={groupByDimensionIds}
          onGroupByDimensionsChange={setGroupByDimensionIds}
        />
      )}
      <MeasurementCollection
        key={groupByDimensionIds.join("/") || "flat"}
        measurements={measurements}
        emptyMessage={getMeasurementEmptyMessage(page)}
        onSelectMeasurement={onSelectMeasurement}
        onToggleVisibility={(measurementId, visible) =>
          onSetMeasurementVisibility(page.pageNumber, measurementId, visible)
        }
        groups={groups}
        groupByDimensionId={groupByDimensionIds[0] ?? null}
        onSetMeasurementsVisibility={(measurementIds, visible) =>
          onSetMeasurementsVisibility(page.pageNumber, measurementIds, visible)
        }
      />
    </aside>
  );
}
