import { createEmptySession } from "../app/sessionState";
import type { CurrentSession, Measurement } from "../types/domain";

// LCG fijo: fixtures reproducibles sin depender del reloj ni de Math.random.
export function performanceSession(count = 5000): CurrentSession {
  let seed = 0x5eed;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const session = createEmptySession({ name: "rendimiento.pdf", size: 3, lastModified: 1 }, 1);
  const page = session.pages[1]!;
  page.calibrations = [{ id: "scale", name: "Escala", mode: "uniform", start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, referenceDistanceMm: 1000 }];
  page.activeCalibrationId = "scale";
  session.classificationCatalog.dimensions = ["trade", "level"].map((id) => ({
    id, name: id, archived: false, templateOrigin: null,
    values: Array.from({ length: 20 }, (_, i) => ({ id: `${id}-${i}`, name: `${id} ${i}`, archived: false })),
  }));
  page.measurements = Array.from({ length: count }, (_, i): Measurement => {
    const x = Math.floor(random() * 10000);
    const y = Math.floor(random() * 10000);
    return { id: `m-${i}`, name: `Medición ${i}`, type: "line", points: [{ x, y }, { x: x + 10, y: y + 5 }], calibrationId: "scale", classificationValueIds: [`trade-${i % 20}`, `level-${Math.floor(i / 20) % 20}`], visible: true };
  });
  return session;
}
