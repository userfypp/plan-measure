import { useSessionState } from "../../app/sessionState";
import { useWorkspaceState } from "../../app/workspaceState";
import type { PageState } from "../../types/domain";
import { MeasurementCollection } from "./MeasurementCollection";
import { MeasurementsHeader } from "./MeasurementsHeader";
import { SelectionInspector } from "./SelectionInspector";
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
  onRequestDelete: (request: MeasurementDeleteRequest) => void;
}

export function MeasurementPanel({
  page,
  onSelectMeasurement,
  onRenameMeasurement,
  onRequestDelete,
}: MeasurementPanelProps) {
  const { session } = useSessionState();
  const { selectedMeasurementId } = useWorkspaceState();
  const displayUnit = session?.settings.displayUnit ?? "m";
  const measurements = createMeasurementViewModels(page, displayUnit, selectedMeasurementId);
  const selectedMeasurement =
    measurements.find((measurement) => measurement.id === selectedMeasurementId) ?? null;
  const selectedMeasurementDomain =
    page.measurements.find((measurement) => measurement.id === selectedMeasurementId) ?? null;
  const classificationSummary = selectedMeasurementDomain
    ? session?.classificationCatalog.dimensions
        .flatMap((dimension) =>
          dimension.values
            .filter((value) => selectedMeasurementDomain.classificationValueIds.includes(value.id))
            .map(
              (value) => `${dimension.name}: ${value.name}${value.archived ? " (archived)" : ""}`,
            ),
        )
        .join(" · ") || "None assigned"
    : "None assigned";

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
    <aside className={styles.panel} aria-label="Measurements on current page">
      <MeasurementsHeader count={measurements.length} />
      <MeasurementCollection
        measurements={measurements}
        emptyMessage={getMeasurementEmptyMessage(page)}
        onSelectMeasurement={onSelectMeasurement}
        onRenameMeasurement={(measurementId, name) =>
          onRenameMeasurement(page.pageNumber, measurementId, name)
        }
        onDeleteMeasurement={requestDelete}
      />
      <SelectionInspector
        measurement={selectedMeasurement}
        classificationSummary={classificationSummary}
      />
    </aside>
  );
}
