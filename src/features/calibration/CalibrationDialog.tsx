import { useState, type FormEvent } from "react";
import type { LinearUnit, Point } from "../../types/domain";
import { toMillimetres } from "../../utils/units";
import { Modal } from "../../components/Modal";
import { Button, Input } from "../../components/ui";
import styles from "./CalibrationDialog.module.css";

interface CalibrationDialogProps {
  points: [Point, Point];
  initialName: string;
  title: string;
  referenceLabel?: string;
  includeName?: boolean;
  onConfirm: (calibration: { name: string; referenceDistanceMm: number }) => void;
  onCancel: () => void;
}

export function CalibrationDialog({
  initialName,
  title,
  referenceLabel,
  includeName = true,
  onConfirm,
  onCancel,
}: CalibrationDialogProps) {
  const [name, setName] = useState(initialName);
  const [distance, setDistance] = useState("");
  const [unit, setUnit] = useState<LinearUnit>("m");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (includeName && !trimmedName) {
      setError("Enter a scale name.");
      return;
    }
    const parsed = Number(distance);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter a distance greater than zero.");
      return;
    }
    const referenceDistanceMm = toMillimetres(parsed, unit);
    if (!Number.isFinite(referenceDistanceMm)) {
      setError("Enter a valid distance that is not excessively large.");
      return;
    }
    onConfirm({ name: trimmedName, referenceDistanceMm });
  }

  return (
    <Modal title={title} onCancel={onCancel} modal={false}>
      <p>
        Enter the real-world distance between the two selected points.
        {referenceLabel ? ` This is the ${referenceLabel} reference.` : ""}
      </p>
      <form onSubmit={submit} className={styles.form}>
        {includeName && (
          <Input
            id="calibration-name"
            label="Scale name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        )}
        <div className={styles.inputRow}>
          <Input
            id="calibration-distance"
            label="Reference distance"
            type="number"
            min="0"
            step="any"
            value={distance}
            onChange={(event) => setDistance(event.target.value)}
            autoFocus={!includeName}
          />
          <label className={styles.unitField}>
            <span>Unit</span>
            <select
              aria-label="Calibration unit"
              value={unit}
              onChange={(event) => setUnit(event.target.value as LinearUnit)}
            >
              <option value="mm">mm</option>
              <option value="cm">cm</option>
              <option value="m">m</option>
            </select>
          </label>
        </div>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button type="submit">Save scale</Button>
        </div>
      </form>
    </Modal>
  );
}
