import { useId, useRef, useState, type FormEvent, type RefObject } from "react";
import { Button, Dialog, Input } from "../../components/ui";
import {
  createPageCalibrationFromRatio,
  isValidScaleRatioDenominator,
  type RatioCalibrationInput,
  type ScaleRatioSpec,
} from "./ratioCalibration";
import styles from "./CustomRatioDialog.module.css";

type RatioMode = "uniform" | "xy";

interface CustomRatioDialogBaseProps {
  onCancel: () => void;
}

interface CreateCustomRatioDialogProps extends CustomRatioDialogBaseProps {
  purpose: "create";
  initialName: string;
  onConfirm: (result: { name: string; calibration: RatioCalibrationInput }) => void;
}

interface SetCustomRatioDialogProps extends CustomRatioDialogBaseProps {
  purpose: "set";
  initialRatio: ScaleRatioSpec;
  onConfirm: (calibration: RatioCalibrationInput) => void;
}

export type CustomRatioDialogProps = CreateCustomRatioDialogProps | SetCustomRatioDialogProps;

interface RatioFieldProps {
  id: string;
  label: string;
  value: string;
  error: string | null;
  inputRef?: RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
}

function RatioField({ id, label, value, error, inputRef, onChange }: RatioFieldProps) {
  const labelId = `${id}-label`;
  return (
    <div className={styles.ratioField}>
      <span id={labelId} className={styles.fieldLabel}>
        {label}
      </span>
      <div className={styles.ratioInputRow}>
        <span className={styles.ratioPrefix} aria-hidden="true">
          1 :
        </span>
        <Input
          ref={inputRef}
          id={id}
          aria-labelledby={labelId}
          type="number"
          step="any"
          inputMode="decimal"
          value={value}
          error={error}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </div>
  );
}

function ratioInputError(value: string): string | null {
  if (!value.trim()) return "Enter a ratio denominator.";
  const denominator = Number(value);
  if (!Number.isFinite(denominator) || denominator <= 0) {
    return "Enter a ratio denominator greater than zero.";
  }
  return isValidScaleRatioDenominator(denominator)
    ? null
    : "Enter a ratio denominator within the supported range.";
}

export function CustomRatioDialog(props: CustomRatioDialogProps) {
  const initialRatio = props.purpose === "set" ? props.initialRatio : null;
  const [name, setName] = useState(props.purpose === "create" ? props.initialName : "");
  const [mode, setMode] = useState<RatioMode>(initialRatio?.mode ?? "uniform");
  const [uniformRatio, setUniformRatio] = useState(
    initialRatio?.mode === "uniform" ? String(initialRatio.denominator) : "",
  );
  const [xRatio, setXRatio] = useState(
    initialRatio?.mode === "xy" ? String(initialRatio.xDenominator) : "",
  );
  const [yRatio, setYRatio] = useState(
    initialRatio?.mode === "xy" ? String(initialRatio.yDenominator) : "",
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const [uniformError, setUniformError] = useState<string | null>(null);
  const [xError, setXError] = useState<string | null>(null);
  const [yError, setYError] = useState<string | null>(null);
  const modeLegendId = useId();
  const initialRatioFocusRef = useRef<HTMLInputElement>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    const nextNameError = props.purpose === "create" && !trimmedName ? "Enter a scale name." : null;
    setNameError(nextNameError);

    if (mode === "uniform") {
      const nextUniformError = ratioInputError(uniformRatio);
      setUniformError(nextUniformError);
      if (nextNameError || nextUniformError) return;
      const calibration = createPageCalibrationFromRatio({
        mode: "uniform",
        denominator: Number(uniformRatio),
      });
      if (props.purpose === "create") props.onConfirm({ name: trimmedName, calibration });
      else props.onConfirm(calibration);
      return;
    }

    const nextXError = ratioInputError(xRatio);
    const nextYError = ratioInputError(yRatio);
    setXError(nextXError);
    setYError(nextYError);
    if (nextNameError || nextXError || nextYError) return;
    const calibration = createPageCalibrationFromRatio({
      mode: "xy",
      xDenominator: Number(xRatio),
      yDenominator: Number(yRatio),
    });
    if (props.purpose === "create") props.onConfirm({ name: trimmedName, calibration });
    else props.onConfirm(calibration);
  }

  return (
    <Dialog
      open
      title={props.purpose === "create" ? "Custom ratio" : "Set ratio"}
      size="small"
      onClose={props.onCancel}
      initialFocus={initialRatioFocusRef}
      trapFocus
    >
      <form className={styles.form} onSubmit={submit} noValidate>
        {props.purpose === "create" && (
          <>
            <Input
              id="custom-ratio-name"
              label="Scale name"
              value={name}
              error={nameError}
              onChange={(event) => {
                setName(event.target.value);
                setNameError(null);
              }}
            />

            <fieldset className={styles.modeGroup} aria-labelledby={modeLegendId}>
              <legend id={modeLegendId}>Mode</legend>
              <div className={styles.modeOptions}>
                <label>
                  <input
                    type="radio"
                    name="custom-ratio-mode"
                    value="uniform"
                    checked={mode === "uniform"}
                    onChange={() => setMode("uniform")}
                  />
                  <span>Uniform</span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="custom-ratio-mode"
                    value="xy"
                    checked={mode === "xy"}
                    onChange={() => setMode("xy")}
                  />
                  <span>X/Y</span>
                </label>
              </div>
            </fieldset>
          </>
        )}

        {mode === "uniform" ? (
          <RatioField
            id="custom-ratio-uniform"
            label="Scale ratio"
            value={uniformRatio}
            error={uniformError}
            inputRef={initialRatioFocusRef}
            onChange={(value) => {
              setUniformRatio(value);
              setUniformError(null);
            }}
          />
        ) : (
          <div className={styles.xyRatios}>
            <RatioField
              id="custom-ratio-x"
              label="X ratio"
              value={xRatio}
              error={xError}
              inputRef={initialRatioFocusRef}
              onChange={(value) => {
                setXRatio(value);
                setXError(null);
              }}
            />
            <RatioField
              id="custom-ratio-y"
              label="Y ratio"
              value={yRatio}
              error={yError}
              onChange={(value) => {
                setYRatio(value);
                setYError(null);
              }}
            />
          </div>
        )}

        <div className={styles.actions}>
          <Button variant="secondary" onClick={props.onCancel}>
            Cancel
          </Button>
          <Button type="submit">{props.purpose === "create" ? "Save scale" : "Save"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
