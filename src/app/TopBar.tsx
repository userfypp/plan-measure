import type { LinearUnit, SessionV1 } from "../types/domain";
import styles from "./TopBar.module.css";

interface TopBarProps {
  session: SessionV1 | null;
  onOpenPdf: () => void;
  onExport: () => void;
  onSettingChange: (
    setting: "displayUnit" | "showLabels" | "showMeasurements" | "showCalibration",
    value: LinearUnit | boolean,
  ) => void;
}

export function TopBar({ session, onOpenPdf, onExport, onSettingChange }: TopBarProps) {
  return (
    <header className={styles.topBar}>
      <div className={styles.brand}>Plan Measure</div>
      <button type="button" className={styles.open} onClick={onOpenPdf}>
        Open PDF
      </button>
      <div className={styles.fileName} title={session?.pdf.name}>
        {session?.pdf.name ?? "No PDF loaded"}
      </div>
      {session && (
        <>
          <label className={styles.unit}>
            Unit
            <select
              value={session.settings.displayUnit}
              onChange={(event) => onSettingChange("displayUnit", event.target.value as LinearUnit)}
            >
              <option value="mm">mm</option>
              <option value="cm">cm</option>
              <option value="m">m</option>
            </select>
          </label>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={session.settings.showLabels}
              onChange={(event) => onSettingChange("showLabels", event.target.checked)}
            />
            Show labels
          </label>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={session.settings.showMeasurements}
              onChange={(event) => onSettingChange("showMeasurements", event.target.checked)}
            />
            Show measurements
          </label>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={session.settings.showCalibration}
              onChange={(event) => onSettingChange("showCalibration", event.target.checked)}
            />
            Show calibration
          </label>
          <button type="button" className={styles.export} onClick={onExport}>
            Export CSV
          </button>
        </>
      )}
    </header>
  );
}
