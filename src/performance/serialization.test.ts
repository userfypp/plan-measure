import "fake-indexeddb/auto";
// @ts-expect-error Los tipos Node no forman parte de la aplicación.
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { enqueueAutosave } from "../app/autosave";
import { buildCsv, buildCsvInBatches } from "../services/csv";
import { loadSavedSession, replaceSavedSession, resetPersistenceForTests, saveSessionMetadata } from "../services/persistence";
import { prepareSessionSnapshot } from "../services/persistenceCodec";
import { performanceSession } from "./fixtures";

afterEach(async () => { vi.restoreAllMocks(); await resetPersistenceForTests(); });

describe("presupuestos de serialización", () => {
  it("autosave de 5000 mediciones serializa exactamente una vez y escribe el snapshot", async () => {
    await resetPersistenceForTests();
    const original = performanceSession();
    const pdf = new Blob(["pdf"]);
    const revision = await replaceSavedSession(original, pdf, null);
    const edited = { ...original, pages: { 1: { ...original.pages[1]!, measurements: original.pages[1]!.measurements.map((item, index) => index === 0 ? { ...item, name: "Editada" } : item) } } };
    const stringify = vi.spyOn(JSON, "stringify");
    const prepared = prepareSessionSnapshot(edited);
    await enqueueAutosave(Promise.resolve(), edited, 1, () => true, (snapshot) => saveSessionMetadata(snapshot, revision, pdf, prepared).then(() => undefined));
    expect(stringify).toHaveBeenCalledTimes(1);
    stringify.mockRestore();
    expect((await loadSavedSession())!.session.pages[1]!.measurements[0]!.name).toBe("Editada");
  });

  it("CSV cede cada ≤200 filas y conserva bytes y hash de 5000 mediciones", async () => {
    const session = performanceSession();
    const page = session.pages[1]!;
    let built = 0;
    for (const measurement of page.measurements) {
      const points = measurement.points;
      Object.defineProperty(measurement, "points", { get: () => { built++; return points; }, enumerable: true });
    }
    // Cuenta filas al entrar en el generador, independientemente de sus lecturas internas.
    let visited = 0;
    const originalIterator = page.measurements[Symbol.iterator].bind(page.measurements);
    page.measurements[Symbol.iterator] = function* () { for (const row of originalIterator()) { visited++; yield row; } return undefined; };
    vi.spyOn(performance, "now").mockReturnValue(0);
    const batches: number[] = [];
    let last = 0;
    const csv = await buildCsvInBatches(session, null, undefined, async () => { batches.push(visited - last); last = visited; });
    expect(built).toBeGreaterThan(0);
    expect(batches).toHaveLength(25);
    expect(Math.max(...batches, visited - last)).toBeLessThanOrEqual(200);
    expect(visited).toBe(5000);
    expect(csv).toBe(buildCsv(session));
    expect(createHash("sha256").update(csv).digest("hex")).toBe("3888fbdba8061522c7e63c70c347f674d209cad2610d32d7400fbf8a79cbd228");
  });
});
