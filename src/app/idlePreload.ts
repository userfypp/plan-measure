const idle = () =>
  new Promise<void>((resolve) => {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => resolve(), { timeout: 4000 });
    } else window.setTimeout(resolve, 1000);
  });

/** Downloads `tasks` one by one while the browser is idle; returns a cancel function. */
export function preloadWhenIdle(tasks: readonly (() => Promise<unknown>)[]): () => void {
  let cancelled = false;
  // A failed preload is retried by the regular on-demand path.
  void tasks.reduce<Promise<unknown>>(
    (previous, task) =>
      previous
        .then(idle)
        .then(() => cancelled || task())
        .catch(() => undefined),
    Promise.resolve(),
  );
  return () => {
    cancelled = true;
  };
}
