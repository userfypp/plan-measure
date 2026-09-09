import { useState } from "react";
import { AnchoredMenu, Button } from "../../components/ui";
import type { CalibrationReferenceKey, PageCalibration, PageState } from "../../types/domain";
import { formatDisplayNumber } from "../../utils/format";
import { scaleDisplayMetadata } from "../viewer/scaleDisplay";
import styles from "./ScalesWorkspace.module.css";

export interface ScalesWorkspaceProps {
  page: PageState;
  actionsDisabled?: boolean;
  onAddScale: (mode: "uniform" | "xy") => void;
  onRecalibrate: (calibrationId: string) => void;
  onEditReference: (calibration: PageCalibration, reference: CalibrationReferenceKey) => void;
}

function formatReferenceDistance(millimetres: number): string {
  return millimetres >= 1000
    ? `${formatDisplayNumber(millimetres / 1000)} m`
    : `${formatDisplayNumber(millimetres)} mm`;
}

function ScaleOptionLabel({ mode }: { mode: "uniform" | "xy" }) {
  return (
    <span className={styles.addOptionLabel}>
      <strong>{mode === "uniform" ? "Uniform" : "X/Y"}</strong>
      <span>{mode === "uniform" ? "One reference" : "Separate X and Y references"}</span>
    </span>
  );
}

export function ScalesWorkspace({
  page,
  actionsDisabled = false,
  onAddScale,
  onRecalibrate,
  onEditReference,
}: ScalesWorkspaceProps) {
  const [inspectedScaleId, setInspectedScaleId] = useState<string | null>(null);

  return (
    <section className={styles.workspace} aria-label="Scales on current page">
      <div className={styles.list} role="list" aria-label="Page scales">
        {page.calibrations.length === 0 && (
          <p className={styles.empty}>Add a scale to begin measuring.</p>
        )}
        {page.calibrations.map((calibration) => {
          const metadata = scaleDisplayMetadata(calibration);
          const active = calibration.id === page.activeCalibrationId;
          const inspected = inspectedScaleId === calibration.id;
          const detailId = `scale-details-${calibration.id}`;
          return (
            <article
              key={calibration.id}
              className={[styles.scaleRow, active ? styles.active : "", inspected ? styles.inspected : ""]
                .filter(Boolean)
                .join(" ")}
              role="listitem"
            >
              <button
                type="button"
                className={styles.inspectButton}
                aria-label={`${inspected ? "Collapse" : "Inspect"} scale ${calibration.name}${active ? ", active" : ""}`}
                aria-expanded={inspected}
                aria-controls={detailId}
                onClick={() => setInspectedScaleId(inspected ? null : calibration.id)}
              >
                <span className={styles.activeMark} aria-hidden="true">{active ? "✓" : ""}</span>
                <span className={styles.scaleIdentity}>
                  <strong>{calibration.name}</strong>
                  <span>{metadata.detailLabel}</span>
                </span>
                {active && <span className={styles.activeLabel}>Active</span>}
                <span className={styles.disclosure} aria-hidden="true">···</span>
              </button>
              <div id={detailId} className={styles.scaleDetails} hidden={!inspected}>
                {calibration.mode === "uniform" ? (
                  <div className={styles.referenceRow}>
                    <span>Reference</span>
                    <strong>{formatReferenceDistance(calibration.referenceDistanceMm)}</strong>
                  </div>
                ) : (
                  <>
                    <div className={styles.referenceRow}>
                      <span>X reference</span>
                      <strong>{formatReferenceDistance(calibration.xReference.referenceDistanceMm)}</strong>
                    </div>
                    <div className={styles.referenceRow}>
                      <span>Y reference</span>
                      <strong>{formatReferenceDistance(calibration.yReference.referenceDistanceMm)}</strong>
                    </div>
                  </>
                )}
                <div className={styles.scaleActions}>
                  <Button
                    variant="ghost"
                    size="compact"
                    disabled={actionsDisabled}
                    onClick={() => onRecalibrate(calibration.id)}
                  >
                    Recalibrate
                  </Button>
                  {calibration.mode === "uniform" ? (
                    <Button
                      variant="ghost"
                      size="compact"
                      disabled={actionsDisabled}
                      onClick={() => onEditReference(calibration, "uniform")}
                    >
                      Edit reference
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="compact"
                        disabled={actionsDisabled}
                        onClick={() => onEditReference(calibration, "x")}
                      >
                        Edit X
                      </Button>
                      <Button
                        variant="ghost"
                        size="compact"
                        disabled={actionsDisabled}
                        onClick={() => onEditReference(calibration, "y")}
                      >
                        Edit Y
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className={styles.addScale}>
        <AnchoredMenu
          trigger={<span>+ Add scale</span>}
          triggerProps={{
            className: styles.addScaleTrigger,
            "aria-label": "Add scale",
            disabled: actionsDisabled,
          }}
          label="Add scale"
          items={[
            {
              id: "uniform",
              label: <ScaleOptionLabel mode="uniform" />,
              onSelect: () => onAddScale("uniform"),
            },
            {
              id: "xy",
              label: <ScaleOptionLabel mode="xy" />,
              onSelect: () => onAddScale("xy"),
            },
          ]}
          placement="bottom-start"
        />
      </div>

      <p className={styles.note}>Changing the active scale does not relink measurements.</p>
    </section>
  );
}
