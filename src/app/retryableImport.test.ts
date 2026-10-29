// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { MODULE_RELOAD_REQUIRED, retryableImport } from "./retryableImport";

afterEach(() =>
  document.head.querySelectorAll('link[href*="module-retry"]').forEach((link) => link.remove()),
);

it("waits for missing CSS to load before retrying the module and keeps failures recoverable", async () => {
  const load = vi
    .fn()
    .mockRejectedValueOnce(new Error("Unable to preload CSS for /assets/dialog.css"))
    .mockResolvedValue({ ready: true });
  const retry = retryableImport(load);
  await expect(retry()).rejects.toThrow("Unable to preload CSS");
  const failed = retry();
  const rejected = expect(failed).rejects.toThrow("Unable to preload CSS");
  expect(load).toHaveBeenCalledTimes(1);
  const firstLink = document.head.querySelector<HTMLLinkElement>('link[href*="module-retry"]')!;
  firstLink.dispatchEvent(new Event("error"));
  await rejected;
  expect(firstLink.isConnected).toBe(false);
  const recovered = retry();
  expect(retry()).toBe(recovered);
  const nextLink = document.head.querySelector<HTMLLinkElement>('link[href*="module-retry"]')!;
  expect(nextLink.href).not.toBe(firstLink.href);
  expect(load).toHaveBeenCalledTimes(1);
  nextLink.dispatchEvent(new Event("load"));
  await expect(recovered).resolves.toEqual({ ready: true });
  expect(load).toHaveBeenCalledTimes(2);
});

it("never imports an external URL provided by an error message", async () => {
  const load = vi
    .fn()
    .mockRejectedValueOnce(
      new Error(
        "Failed to fetch dynamically imported module: https://other.example/assets/module.js",
      ),
    )
    .mockResolvedValue({ ready: true });
  const retry = retryableImport(load);
  await expect(retry()).rejects.toThrow("Failed to fetch");
  await expect(retry()).resolves.toEqual({ ready: true });
  expect(load).toHaveBeenCalledTimes(2);
});

it("asks for a reload when a retried module loads but one of its dependencies stays failed", async () => {
  const address = new URL(`${import.meta.env.BASE_URL}assets/export.js`, window.location.href).href;
  const load = vi
    .fn()
    .mockRejectedValue(new Error(`Failed to fetch dynamically imported module: ${address}`));
  const fetchModule = vi.fn().mockResolvedValue(new Response("export {};", { status: 200 }));
  vi.stubGlobal("fetch", fetchModule);
  try {
    const retry = retryableImport(load);
    await expect(retry()).rejects.toThrow("Failed to fetch");
    await expect(retry()).rejects.toThrow(MODULE_RELOAD_REQUIRED);
    expect(fetchModule).toHaveBeenCalledWith(`${address}?module-retry=1`, { cache: "no-store" });

    // While the module itself is still unreachable, the connection is the likely cause.
    fetchModule.mockRejectedValue(new TypeError("Failed to fetch"));
    const offline = retry();
    await expect(offline).rejects.not.toThrow(MODULE_RELOAD_REQUIRED);
    expect(load).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
  }
});
