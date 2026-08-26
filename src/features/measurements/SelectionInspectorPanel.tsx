import { useSessionState } from "../../app/sessionState";
import { useWorkspaceState } from "../../app/workspaceState";
import type { PageState } from "../../types/domain";
import {
  createMeasurementViewModel,
  getMeasurementClassificationSummary,
} from "./measurementViewModels";
import { SelectionInspector } from "./SelectionInspector";

export interface SelectionInspectorPanelProps {
  page: PageState;
}

export function SelectionInspectorPanel({ page }: SelectionInspectorPanelProps) {
  const { session } = useSessionState();
  const { selectedMeasurementId } = useWorkspaceState();
  const selectedMeasurement =
    page.measurements.find((measurement) => measurement.id === selectedMeasurementId) ?? null;
  const displayUnit = session?.settings.displayUnit ?? "m";
  const measurementViewModel = selectedMeasurement
    ? createMeasurementViewModel(page, selectedMeasurement, displayUnit, true)
    : null;
  const classificationSummary = getMeasurementClassificationSummary(
    selectedMeasurement,
    session?.classificationCatalog,
  );

  return (
    <SelectionInspector
      measurement={measurementViewModel}
      classificationSummary={classificationSummary}
    />
  );
}
