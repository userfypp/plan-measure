/**
 * A module whose own file loads but still fails has a failed dependency, which the browser
 * keeps for the life of the page; only a reload can load it again.
 */
export const MODULE_RELOAD_REQUIRED = "Reload the page to load this module.";

/** A failed module request remains cached in some browsers; retry its same-origin URL. */
export function retryableImport<T>(load: () => Promise<T>): () => Promise<T> {
  let failedUrl: URL | null = null;
  let failedStyle: URL | null = null;
  let attempt = 0;
  let pending: Promise<T> | null = null;
  async function run(): Promise<T> {
    try {
      if (failedStyle) {
        const url = new URL(failedStyle.href);
        url.searchParams.set("module-retry", String(++attempt));
        await new Promise<void>((resolve, reject) => {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = url.href;
          link.onload = () => resolve();
          link.onerror = () => {
            link.remove();
            reject(new Error(`Unable to preload CSS for ${url.href}`));
          };
          document.head.append(link);
        });
        failedStyle = null;
      }
      if (!failedUrl) return await load();
      const url = new URL(failedUrl.href);
      url.searchParams.set("module-retry", String(++attempt));
      try {
        return await import(/* @vite-ignore */ url.href) as T;
      } catch (error) {
        const loads = await fetch(url.href, { cache: "no-store" }).then((response) => response.ok, () => false);
        throw loads ? new Error(MODULE_RELOAD_REQUIRED, { cause: error }) : error;
      }
    } catch (error) {
      if (error instanceof Error) {
        const css = error.message.startsWith("Unable to preload CSS for ");
        const address = css ? error.message.slice("Unable to preload CSS for ".length)
          : error.message.includes("dynamically imported module") ? error.message.match(/https?:\/\/\S+/)?.[0] : undefined;
        if (address) {
          const url = new URL(address, window.location.href);
          const base = new URL(import.meta.env.BASE_URL, window.location.href).pathname;
          if (url.origin === window.location.origin &&
            (url.pathname.startsWith(`${base}src/`) || url.pathname.startsWith(`${base}assets/`))) {
            if (css) failedStyle = url;
            else failedUrl = url;
          }
        }
      }
      throw error;
    }
  }
  return () => {
    pending ??= run().finally(() => { pending = null; });
    return pending;
  };
}
