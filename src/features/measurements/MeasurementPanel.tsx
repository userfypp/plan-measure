import { useState, type ReactNode } from "react";
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
  onRenameMeasurement: (pageNumber: number, measurementId: string, name: string) => void;
  onSetMeasurementVisibility: (pageNumber: number, measurementId: string, visible: boolean) => void;
  onSetMeasurementsVisibility: (
    pageNumber: number,
    measurementIds: string[],
    visible: boolean,
  ) => void;
  onRequestDelete: (request: MeasurementDeleteRequest) => void;
  classificationDock?: ReactNode;
}

export function MeasurementPanel({
  page,
  onSelectMeasurement,
  onRenameMeasurement,
  onSetMeasurementVisibility,
  onSetMeasurementsVisibility,
  onRequestDelete,
  classificationDock,
}: MeasurementPanelProps) {
  const { session } = useSessionState();
  const { selectedMeasurementId } = useWorkspaceState();
  const displayUnit = session?.settings.displayUnit ?? "m";
  const [groupByDimensionId, setGroupByDimensionId] = useState<string | null>(null);
  const measurements = createMeasurementViewModels(page, displayUnit, selectedMeasurementId);
  const catalog = session?.classificationCatalog ?? { dimensions: [] };
  const hasGroupBy = catalog.dimensions.length > 0;
  const groups = groupByDimensionId
    ? createMeasurementGroups(page.measurements, catalog, groupByDimensionId)
    : undefined;

  function requestDelete(measurementId: string) {
    const measurement = measurements.find((candidate) => candidate.id === measurementId);
    if (!measurement) return;
    onRequestDelete({
      pageNumber: page.pageNumber,
      measurementId: measurement.id,
      measurementName: measurement.name,
    });
  }

  return (
    <aside
      className={[styles.panel, hasGroupBy ? "" : styles.withoutGroupBy].filter(Boolean).join(" ")}
      aria-label="Measurements on current page"
    >
      {hasGroupBy && (
        <MeasurementsHeader
          dimensions={catalog.dimensions}
          groupByDimensionId={groupByDimensionId}
          onGroupByDimensionChange={setGroupByDimensionId}
        />
      )}
      <MeasurementCollection
        key={groupByDimensionId ?? "flat"}
        measurements={measurements}
        emptyMessage={getMeasurementEmptyMessage(page)}
        onSelectMeasurement={onSelectMeasurement}
        onRenameMeasurement={(measurementId, name) =>
          onRenameMeasurement(page.pageNumber, measurementId, name)
        }
        onToggleVisibility={(measurementId, visible) =>
          onSetMeasurementVisibility(page.pageNumber, measurementId, visible)
        }
        groups={groups}
        groupByDimensionId={groupByDimensionId}
        onSetMeasurementsVisibility={(measurementIds, visible) =>
          onSetMeasurementsVisibility(page.pageNumber, measurementIds, visible)
        }
        onDeleteMeasurement={requestDelete}
      />
      {classificationDock ? (
        <div className={styles.classificationSlot} data-layout-slot="classification-assignment">
          {classificationDock}
        </div>
      ) : (
        <div className={styles.futureSlot} aria-hidden="true" data-layout-slot="future-panel" />
      )}
    </aside>
  );
}
