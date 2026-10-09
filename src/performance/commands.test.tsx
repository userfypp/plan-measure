// @vitest-environment jsdom
import { act, memo } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { SessionProvider, useMeasurementCommands, useSessionState } from "../app/sessionState";
import { AppProvider } from "../app/state";
import { performanceSession } from "./fixtures";

it("5000 consumidores de comandos no se notifican por preferencias, edición ni undo", () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let renders = 0;
  let commands: ReturnType<typeof useMeasurementCommands> | null = null;
  let state: ReturnType<typeof useSessionState> | null = null;
  function Probe() { state = useSessionState(); return null; }
  const Consumer = memo(function Consumer() {
    commands = useMeasurementCommands();
    renders++;
    return null;
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    act(() => root.render(<AppProvider><SessionProvider><Probe />{Array.from({ length: 5000 }, (_, i) => <Consumer key={i} />)}</SessionProvider></AppProvider>));
    const current = () => state as unknown as ReturnType<typeof useSessionState>;
    const stable = commands as unknown as ReturnType<typeof useMeasurementCommands>;
    expect(renders).toBe(5000);
    act(() => current().loadSession(performanceSession()));
    const before = renders;
    act(() => current().updateSettings({ showLabels: false }));
    expect(renders - before).toBe(0);
    expect(commands).toBe(stable);
    const points = [{ x: 100, y: 100 }, { x: 110, y: 105 }];
    act(() => expect(stable.updateMeasurement({ pageNumber: 1, id: "m-0", points })).toBe(true));
    expect(current().session!.pages[1]!.measurements[0]!.points).toEqual(points);
    act(() => current().undo());
    expect(current().session!.pages[1]!.measurements[0]!.points).not.toEqual(points);
    expect(renders - before).toBe(0);
    expect(commands).toBe(stable);
  } finally { act(() => root.unmount()); container.remove(); }
});
