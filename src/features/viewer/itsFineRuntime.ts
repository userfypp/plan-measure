// react-konva bridges the DOM tree's contexts into the canvas with its-fine. On every Stage render
// its-fine redefines two accessors on each ancestor context; after the first render they are
// non-configurable, so every later call throws and is caught (one exception per context per
// render). vite.config.ts aliases "its-fine" to this module, which defines those accessors as
// configurable first so its-fine's redefinition succeeds without throwing.
import {
  useContextBridge as useItsFineContextBridge,
  useFiber,
  type ContextBridge,
} from "its-fine/dist/index.js";

export * from "its-fine/dist/index.js";

const RENDERER_KEYS = ["_currentRenderer", "_currentRenderer2"] as const;
const REACT_CONTEXT = Symbol.for("react.context");
const preparedContexts = new WeakSet<object>();

function prepareContext(context: object): void {
  if (preparedContexts.has(context)) return;
  preparedContexts.add(context);
  for (const key of RENDERER_KEYS) {
    if (Object.getOwnPropertyDescriptor(context, key)) continue;
    try {
      Object.defineProperty(context, key, { get: () => null, set: () => {}, configurable: true });
    } catch {
      // A frozen context keeps its-fine's original behaviour.
    }
  }
}

function isContext(type: unknown): type is object {
  return (
    typeof type === "object" &&
    type !== null &&
    (type as { $$typeof?: unknown }).$$typeof === REACT_CONTEXT
  );
}

export function useContextBridge(): ContextBridge {
  for (let fiber = useFiber(); fiber; fiber = fiber.return ?? undefined) {
    if (isContext(fiber.type)) prepareContext(fiber.type);
  }
  return useItsFineContextBridge();
}
