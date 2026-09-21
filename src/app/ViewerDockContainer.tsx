import { ViewerDock } from "../features/viewer/ViewerDock";
import type { ViewerNavigationModel } from "../features/viewer/ViewerNavigation";
import { effectivePageLabel, sourcePageLabel } from "../utils/pageLabels";
import { useSessionState } from "./sessionState";
import { useWorkspaceState } from "./workspaceState";

export function ViewerDockContainer({
  navigation,
  sourcePageLabels,
}: {
  navigation: ViewerNavigationModel;
  sourcePageLabels: readonly string[] | null;
}) {
  const {
    session,
    setActiveCalibration,
    setPageLabelOverride,
    removePageLabelOverride,
    updateSettings,
  } = useSessionState();
  const { draft, calibrationFlow, calibrationReferenceEdit } = useWorkspaceState();
  const currentPage = session?.pages[session.currentPage] ?? null;

  if (!session || !currentPage) return null;
  const pageNumber = navigation.pageNumber;
  const pdfPageLabel = sourcePageLabel(pageNumber, sourcePageLabels);
  const customPageLabel = session.pageLabelOverrides[pageNumber] ?? null;

  return (
    <ViewerDock
      navigation={navigation}
      sourcePageLabel={pdfPageLabel}
      customPageLabel={customPageLabel}
      effectivePageLabel={effectivePageLabel(
        pageNumber,
        session.pageLabelOverrides,
        sourcePageLabels,
      )}
      calibrations={currentPage.calibrations}
      activeCalibrationId={currentPage.activeCalibrationId}
      pageNavigationDisabled={Boolean(draft || calibrationFlow || calibrationReferenceEdit)}
      scaleSwitchDisabled={Boolean(draft || calibrationFlow || calibrationReferenceEdit)}
      settings={session.settings}
      onScaleChange={(calibrationId) => setActiveCalibration(currentPage.pageNumber, calibrationId)}
      onSetPageLabelOverride={(label) => setPageLabelOverride(pageNumber, label)}
      onRemovePageLabelOverride={() => removePageLabelOverride(pageNumber)}
      onSettingsChange={updateSettings}
    />
  );
}
