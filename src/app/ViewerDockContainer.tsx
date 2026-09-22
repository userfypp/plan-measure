import { ViewerDock } from "../features/viewer/ViewerDock";
import { copyCalibrationToPage } from "../features/calibration/ratioCalibration";
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
    addCalibration,
    setActiveCalibration,
    setPageLabelOverride,
    removePageLabelOverride,
    updateSettings,
  } = useSessionState();
  const {
    draft,
    calibrationFlow,
    calibrationReferenceEdit,
    scaleClipboard,
  } = useWorkspaceState();
  const currentPage = session?.pages[session.currentPage] ?? null;

  if (!session || !currentPage) return null;
  const pageNumber = navigation.pageNumber;
  const pdfPageLabel = sourcePageLabel(pageNumber, sourcePageLabels);
  const customPageLabel = session.pageLabelOverrides[pageNumber] ?? null;
  const scaleWorkflowActive = Boolean(draft || calibrationFlow || calibrationReferenceEdit);
  const copiedScaleName =
    scaleClipboard && scaleClipboard.sourcePageNumber !== pageNumber
      ? scaleClipboard.calibration.name
      : null;

  function applyCopiedScale() {
    if (!scaleClipboard || !copiedScaleName || scaleWorkflowActive) return;
    addCalibration({
      pageNumber,
      id: crypto.randomUUID(),
      name: scaleClipboard.calibration.name,
      calibration: copyCalibrationToPage(scaleClipboard.calibration),
    });
  }

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
      scaleSwitchDisabled={scaleWorkflowActive}
      copiedScaleName={copiedScaleName}
      scaleApplyDisabled={scaleWorkflowActive}
      settings={session.settings}
      onScaleChange={(calibrationId) => setActiveCalibration(currentPage.pageNumber, calibrationId)}
      onApplyCopiedScale={applyCopiedScale}
      onSetPageLabelOverride={(label) => setPageLabelOverride(pageNumber, label)}
      onRemovePageLabelOverride={() => removePageLabelOverride(pageNumber)}
      onSettingsChange={updateSettings}
    />
  );
}
