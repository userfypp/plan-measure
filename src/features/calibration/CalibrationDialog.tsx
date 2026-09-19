import { useId, useState, type FormEvent } from "react";
import type { LinearUnit, Point } from "../../types/domain";
import {
  architecturalSixteenthsToMillimetres,
  MAX_SAFE_ARCHITECTURAL_SIXTEENTHS,
} from "../../utils/format";
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

type CalibrationInputUnit = LinearUnit | "ft-in";

const SIXTEENTHS_PER_INCH = 16;
const SIXTEENTHS_PER_FOOT = 12 * SIXTEENTHS_PER_INCH;
const MAX_ARCHITECTURAL_FEET = Math.floor(
  MAX_SAFE_ARCHITECTURAL_SIXTEENTHS / SIXTEENTHS_PER_FOOT,
);
const FRACTION_OPTIONS = [
  "0",
  "1/16",
  "1/8",
  "3/16",
  "1/4",
  "5/16",
  "3/8",
  "7/16",
  "1/2",
  "9/16",
  "5/8",
  "11/16",
  "3/4",
  "13/16",
  "7/8",
  "15/16",
] as const;

function parseWholeNumber(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function structuredArchitecturalDistanceMm(
  feetInput: string,
  inchesInput: string,
  fractionSixteenths: number,
): number | null {
  const feet = parseWholeNumber(feetInput);
  const inches = parseWholeNumber(inchesInput);
  if (
    feet === null ||
    inches === null ||
    inches > 11 ||
    !Number.isInteger(fractionSixteenths) ||
    fractionSixteenths < 0 ||
    fractionSixteenths >= SIXTEENTHS_PER_INCH
  ) {
    return null;
  }

  const subFootSixteenths = inches * SIXTEENTHS_PER_INCH + fractionSixteenths;
  const maxFeet = Math.floor(
    (MAX_SAFE_ARCHITECTURAL_SIXTEENTHS - subFootSixteenths) / SIXTEENTHS_PER_FOOT,
  );
  if (feet > maxFeet) return null;
  const totalSixteenths = feet * SIXTEENTHS_PER_FOOT + subFootSixteenths;
  return architecturalSixteenthsToMillimetres(totalSixteenths);
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
  const [unit, setUnit] = useState<CalibrationInputUnit>("m");
  const [feet, setFeet] = useState("0");
  const [inches, setInches] = useState("0");
  const [fractionSixteenths, setFractionSixteenths] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  function changeUnit(nextUnit: CalibrationInputUnit) {
    setUnit(nextUnit);
    setDistance("");
    setFeet("0");
    setInches("0");
    setFractionSixteenths(0);
    setError(null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (includeName && !trimmedName) {
      setError("Enter a scale name.");
      return;
    }
    const referenceDistanceMm =
      unit === "ft-in"
        ? structuredArchitecturalDistanceMm(feet, inches, fractionSixteenths)
        : (() => {
            const parsed = Number(distance);
            if (!Number.isFinite(parsed) || parsed <= 0) return null;
            return toMillimetres(parsed, unit);
          })();
    if (unit === "ft-in" && referenceDistanceMm === null) {
      setError("Enter whole feet and whole inches from 0 to 11 within the supported range.");
      return;
    }
    if (referenceDistanceMm === null || referenceDistanceMm <= 0) {
      setError("Enter a distance greater than zero.");
      return;
    }
    if (!Number.isFinite(referenceDistanceMm)) {
      setError("Enter a valid distance that is not excessively large.");
      return;
    }
    onConfirm({ name: trimmedName, referenceDistanceMm });
  }

  return (
    <Modal title={title} onCancel={onCancel} modal={false} trapFocus>
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
        <div className={`${styles.inputRow} ${unit === "ft-in" ? styles.unitOnlyRow : ""}`}>
          {unit !== "ft-in" && (
            <Input
              id="calibration-distance"
              label="Reference distance"
              type="number"
              min="0"
              step="any"
              value={distance}
              aria-describedby={error ? errorId : undefined}
              className={error ? styles.invalidControl : undefined}
              onChange={(event) => {
                setDistance(event.target.value);
                setError(null);
              }}
              autoFocus={!includeName}
            />
          )}
          <label className={styles.unitField}>
            <span>Unit</span>
            <select
              aria-label="Calibration unit"
              value={unit}
              onChange={(event) => {
                changeUnit(event.target.value as CalibrationInputUnit);
              }}
            >
              <option value="mm">Millimetres</option>
              <option value="cm">Centimetres</option>
              <option value="m">Metres</option>
              <option value="in">Inches</option>
              <option value="ft">Feet</option>
              <option value="ft-in">Feet &amp; inches</option>
            </select>
          </label>
        </div>
        {unit === "ft-in" && (
          <fieldset
            className={styles.architecturalGroup}
            aria-describedby={error ? errorId : undefined}
            aria-invalid={error ? true : undefined}
          >
            <legend>Reference distance</legend>
            <div className={styles.architecturalInputs}>
              <div className={styles.inputWithSuffix}>
                <Input
                  id="calibration-feet"
                  label="Feet"
                  type="number"
                  min="0"
                  max={String(MAX_ARCHITECTURAL_FEET)}
                  step="1"
                  inputMode="numeric"
                  value={feet}
                  aria-describedby={error ? errorId : undefined}
                  className={error ? styles.invalidControl : undefined}
                  onChange={(event) => {
                    setFeet(event.target.value);
                    setError(null);
                  }}
                />
                <span className={styles.unitSuffix} aria-hidden="true">
                  ft
                </span>
              </div>
              <div className={styles.inputWithSuffix}>
                <Input
                  id="calibration-inches"
                  label="Inches"
                  type="number"
                  min="0"
                  max="11"
                  step="1"
                  inputMode="numeric"
                  value={inches}
                  aria-describedby={error ? errorId : undefined}
                  className={error ? styles.invalidControl : undefined}
                  onChange={(event) => {
                    setInches(event.target.value);
                    setError(null);
                  }}
                />
                <span className={styles.unitSuffix} aria-hidden="true">
                  in
                </span>
              </div>
              <label className={styles.fractionField}>
                <span>Fractional inches</span>
                <select
                  id="calibration-fraction"
                  aria-label="Fractional inches"
                  aria-describedby={error ? errorId : undefined}
                  value={fractionSixteenths}
                  onChange={(event) => {
                    setFractionSixteenths(Number(event.target.value));
                    setError(null);
                  }}
                >
                  {FRACTION_OPTIONS.map((label, sixteenths) => (
                    <option key={sixteenths} value={sixteenths}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>
        )}
        {error && (
          <p id={errorId} className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button type="submit">Save scale</Button>
        </div>
      </form>
    </Modal>
  );
}
