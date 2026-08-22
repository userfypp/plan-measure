import { useState, type FormEvent } from "react";
import type { LinearUnit, Point } from "../../types/domain";
import { toMillimetres } from "../../utils/units";
import { Modal } from "../../components/Modal";
import styles from "./CalibrationDialog.module.css";

interface CalibrationDialogProps {
  points: [Point, Point];
  initialName: string;
  title: string;
  onConfirm: (calibration: { name: string; referenceDistanceMm: number }) => void;
  onCancel: () => void;
}

export function CalibrationDialog({
  initialName,
  title,
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
    if (!trimmedName) {
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
    <Modal title={title} onCancel={onCancel} labelledBy="calibration-title" modal={false}>
      <p>Enter the real-world distance between the two selected points.</p>
      <form onSubmit={submit} className={styles.form}>
        <label htmlFor="calibration-name">Scale name</label>
        <input
          id="calibration-name"
          className={styles.nameInput}
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
        />
        <label htmlFor="calibration-distance">Reference distance</label>
        <div className={styles.inputRow}>
          <input
            id="calibration-distance"
            type="number"
            min="0"
            step="any"
            value={distance}
            onChange={(event) => setDistance(event.target.value)}
          />
          <select
            aria-label="Calibration unit"
            value={unit}
            onChange={(event) => setUnit(event.target.value as LinearUnit)}
          >
            <option value="mm">mm</option>
            <option value="cm">cm</option>
            <option value="m">m</option>
          </select>
        </div>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className={styles.primary}>
            Save scale
          </button>
        </div>
      </form>
    </Modal>
  );
}
