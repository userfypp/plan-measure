/**
 * Registers the offline service worker (`sw.js`, emitted by the build). It lives in its own lazy
 * chunk so the startup bundle only carries the `import()`; `main.tsx` loads it on idle after the
 * page has loaded. Unsupported browsers and private modes fail silently: the app works without it.
 */
export async function registerServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
  } catch {
    // Registration can be refused (private mode, blocked storage); the app stays online-only.
  }
}
