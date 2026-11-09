import { afterEach, describe, expect, it, vi } from "vitest";
import { registerServiceWorker } from "./serviceWorkerRegistration";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("registerServiceWorker", () => {
  it("registers sw.js under the app's base path", async () => {
    const register = vi.fn().mockResolvedValue({});
    vi.stubGlobal("navigator", { serviceWorker: { register } });
    await registerServiceWorker();
    expect(register).toHaveBeenCalledWith(`${import.meta.env.BASE_URL}sw.js`);
  });

  it("swallows a refused registration", async () => {
    const register = vi.fn().mockRejectedValue(new Error("SecurityError"));
    vi.stubGlobal("navigator", { serviceWorker: { register } });
    await expect(registerServiceWorker()).resolves.toBeUndefined();
  });

  it("does nothing where service workers are unsupported", async () => {
    vi.stubGlobal("navigator", {});
    await expect(registerServiceWorker()).resolves.toBeUndefined();
  });
});
