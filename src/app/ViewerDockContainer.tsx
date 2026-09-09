import { ViewerDock } from "../features/viewer/ViewerDock";
import type { ViewerNavigationModel } from "../features/viewer/ViewerNavigation";
import { useSessionState } from "./sessionState";
import { useWorkspaceState } from "./workspaceState";

export function ViewerDockContainer({ navigation }: { navigation: ViewerNavigationModel }) {
  const { session, setActiveCalibration, updateSettings } = useSessionState();
  const { calibrationFlow, calibrationReferenceEdit } = useWorkspaceState();
  const currentPage = session?.pages[session.currentPage] ?? null;

  if (!session || !currentPage) return null;

  return (
    <ViewerDock
      navigation={navigation}
      calibrations={currentPage.calibrations}
      activeCalibrationId={currentPage.activeCalibrationId}
      scaleSwitchDisabled={Boolean(calibrationFlow || calibrationReferenceEdit)}
      settings={session.settings}
      onScaleChange={(calibrationId) =>
        setActiveCalibration(currentPage.pageNumber, calibrationId)
      }
      onSettingsChange={updateSettings}
    />
  );
}
