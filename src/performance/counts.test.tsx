// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MeasurementCollection } from "../features/measurements/MeasurementCollection";
import { createMeasurementGroups } from "../features/measurements/measurementGrouping";
import { createMeasurementViewModel } from "../features/measurements/measurementViewModels";
import { performanceSession } from "./fixtures";

describe("presupuestos de operaciones del panel", () => {
  it.each([false, true])("monta ≤40 filas y ≤1000 nodos DOM de 5000 mediciones (agrupado=%s)", (grouped) => {
    const session = performanceSession();
    const page = session.pages[1]!;
    const groups = createMeasurementGroups(page.measurements, session.classificationCatalog, ["trade", "level"]);
    const measurements = page.measurements.map((item) => createMeasurementViewModel(page, item, "m"));
    const wrapper = document.createElement("div");
    wrapper.innerHTML = renderToStaticMarkup(<MeasurementCollection measurements={measurements} emptyMessage="Vacío" onSelectMeasurement={() => undefined} onToggleVisibility={() => undefined} groups={grouped ? groups : undefined} groupByDimensionId={grouped ? "trade" : null} onSetMeasurementsVisibility={() => undefined} />);
    expect(wrapper.querySelectorAll('[role="listitem"]').length).toBeGreaterThan(0);
    expect(wrapper.querySelectorAll('[role="listitem"]').length).toBeLessThanOrEqual(40);
    expect(wrapper.querySelectorAll("*").length).toBeLessThanOrEqual(1000);
  });

  it("agrupa N y 5N con búsquedas por ID lineales", () => {
    const costs = [1000, 5000].map((count) => {
      const session = performanceSession(count);
      let reads = 0;
      for (const measurement of session.pages[1]!.measurements) {
        const id = measurement.id;
        Object.defineProperty(measurement, "id", { get: () => { reads++; return id; }, enumerable: true });
      }
      const groups = createMeasurementGroups(session.pages[1]!.measurements, session.classificationCatalog, ["trade", "level"]);
      expect(groups.flatMap((group) => group.children!.flatMap((child) => child.measurementIds))).toHaveLength(count);
      expect(reads).toBeLessThanOrEqual(count * 6);
      return reads;
    });
    expect(costs[1]! / costs[0]!).toBeLessThanOrEqual(5.1);
  });

  it("el índice ID→medición del panel evita búsquedas completas para cada fila agrupada", () => {
    const session = performanceSession();
    const page = session.pages[1]!;
    const groups = createMeasurementGroups(page.measurements, session.classificationCatalog, ["trade", "level"]);
    let reads = 0;
    const measurements = page.measurements.map((item) => {
      const model = createMeasurementViewModel(page, item, "m");
      Object.defineProperty(model, "id", { get: () => { reads++; return item.id; }, enumerable: true });
      return model;
    });
    const markup = renderToStaticMarkup(<MeasurementCollection measurements={measurements} emptyMessage="Vacío" onSelectMeasurement={() => undefined} onToggleVisibility={() => undefined} groups={groups} groupByDimensionId="trade" onSetMeasurementsVisibility={() => undefined} />);
    expect(markup).toContain("Medición");
    expect(reads).toBeLessThanOrEqual(5000 * 6);
  });
});
