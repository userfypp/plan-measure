import { memo, useRef, useState, type Dispatch, type KeyboardEvent } from "react";
import { useAppState, type AppAction } from "../../app/state";
import type { LinearUnit, Measurement, PageState } from "../../types/domain";
import { getActiveCalibration, getMeasurementCalibration } from "../../utils/calibration";
import { formatMeasurement } from "../../utils/format";
import { measurementPathSpecs } from "../../utils/geometry";
import styles from "./MeasurementPanel.module.css";

export function MeasurementPanel({ page }: { page: PageState }) {
  const { state, dispatch } = useAppState();
  const displayUnit = state.session?.settings.displayUnit ?? "m";
  return (
    <aside className={styles.panel} aria-label="Measurements on current page">
      <div className={styles.header}>
        <h2>Measurements</h2>
        <span>{page.measurements.length}</span>
      </div>
      {page.measurements.length === 0 ? (
        <div className={styles.empty}>
          {getActiveCalibration(page)
            ? "Choose Line, Polyline, or Polygon to add a measurement."
            : "Add a scale to begin measuring."}
        </div>
      ) : (
        <div className={styles.list} role="list" aria-label="Measurements">
          {page.measurements.map((measurement) => (
            <MeasurementItem
              key={measurement.id}
              pageNumber={page.pageNumber}
              page={page}
              measurement={measurement}
              selected={state.selectedMeasurementId === measurement.id}
              displayUnit={displayUnit}
              dispatch={dispatch}
            />
          ))}
        </div>
      )}
    </aside>
  );
}

export interface MeasurementItemProps {
  pageNumber: number;
  page: PageState;
  measurement: Measurement;
  selected: boolean;
  displayUnit: LinearUnit;
  dispatch: Dispatch<AppAction>;
}

export const MeasurementItem = memo(function MeasurementItem({
  pageNumber,
  page,
  measurement,
  selected,
  displayUnit,
  dispatch,
}: MeasurementItemProps) {
  const [name, setName] = useState(measurement.name);
  const cancelBlurRef = useRef(false);
  const calibration = getMeasurementCalibration(page, measurement);

  function commitName() {
    if (cancelBlurRef.current) {
      cancelBlurRef.current = false;
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      setName(measurement.name);
      dispatch({ type: "SET_ERROR", message: "Measurement name cannot be empty." });
      return;
    }
    dispatch({
      type: "RENAME_MEASUREMENT",
      pageNumber,
      id: measurement.id,
      name: trimmed,
    });
    setName(trimmed);
  }

  function handleNameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") {
      cancelBlurRef.current = true;
      setName(measurement.name);
      event.currentTarget.blur();
    }
  }

  function selectMeasurement() {
    dispatch({ type: "SELECT_MEASUREMENT", id: measurement.id });
  }

  return (
    <article
      className={`${styles.item} ${selected ? styles.selected : ""}`}
      role="listitem"
      onClick={selectMeasurement}
    >
      <div className={styles.itemTop}>
        <input
          aria-label={`Name for ${measurement.name}`}
          value={name}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => setName(event.target.value)}
          onBlur={commitName}
          onKeyDown={handleNameKeyDown}
        />
        <button
          type="button"
          className={styles.delete}
          aria-label={`Delete ${measurement.name}`}
          title={`Delete ${measurement.name}`}
          onClick={(event) => {
            event.stopPropagation();
            dispatch({
              type: "DELETE_MEASUREMENT",
              pageNumber,
              id: measurement.id,
            });
          }}
        >
          Delete
        </button>
      </div>
      <button
        type="button"
        className={styles.selection}
        aria-label={`${selected ? "Selected" : "Select"} measurement ${measurement.name}`}
        aria-pressed={selected}
        aria-describedby={`measurement-details-${measurement.id}`}
        onClick={(event) => {
          event.stopPropagation();
          selectMeasurement();
        }}
      >
        <span id={`measurement-details-${measurement.id}`} className={styles.details}>
          <span className={styles.type}>{measurementPathSpecs[measurement.type].label}</span>
          <span className={styles.value}>
            {calibration
              ? formatMeasurement(measurement, calibration, displayUnit)
              : "Scale unavailable"}
          </span>
          <span className={styles.scale}>
            Scale: {calibration?.name ?? "Unavailable"}
            {calibration?.mode === "xy" ? " · X/Y" : ""}
          </span>
        </span>
      </button>
    </article>
  );
});
