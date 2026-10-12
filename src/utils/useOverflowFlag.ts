import { useLayoutEffect, type RefObject } from "react";

/**
 * Mantiene `data-overflow` en el elemento mientras su contenido desborda en vertical. Se escribe
 * directamente en el DOM (sin estado React) para no provocar renders. `contentKey` re-engancha el
 * observador cuando cambia el primer hijo observado. El CSS usa el atributo para reservar el hueco
 * de la barra de scroll solo cuando no está presente.
 */
export function useOverflowFlag(ref: RefObject<HTMLElement | null>, contentKey?: unknown): void {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      element.toggleAttribute("data-overflow", element.scrollHeight > element.clientHeight);
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }, [ref, contentKey]);
}
