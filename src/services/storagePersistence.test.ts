import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStoragePersistenceRequest } from "./storagePersistence";

beforeEach(() => vi.stubGlobal("isSecureContext", true));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("persistent browser storage", () => {
  it.each([undefined, {}, { persist: vi.fn() }, { persisted: vi.fn() }])(
    "ignores missing capabilities: %j",
    async (storage) => {
      vi.stubGlobal("navigator", { storage });
      const request = createStoragePersistenceRequest();
      request(true);
      await settle();
      if (storage?.persist) expect(storage.persist).not.toHaveBeenCalled();
      if (storage?.persisted) expect(storage.persisted).not.toHaveBeenCalled();
    },
  );

  it.each([true, false, "rejected"])("requests once when persist returns %s", async (result) => {
    const persist =
      result === "rejected"
        ? vi.fn().mockRejectedValue(new Error("Denied"))
        : vi.fn().mockResolvedValue(result);
    const persisted = vi.fn().mockResolvedValue(false);
    vi.stubGlobal("navigator", { storage: { persist, persisted } });
    const request = createStoragePersistenceRequest();
    expect(persisted).not.toHaveBeenCalled();
    request(false);
    await settle();
    expect(persisted).not.toHaveBeenCalled();
    request(true);
    request(true);
    await settle();
    request(true);
    await settle();
    expect(persisted).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledOnce();
  });

  it("does not request when persistence is already granted", async () => {
    const persist = vi.fn();
    const persisted = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("navigator", { storage: { persist, persisted } });
    const request = createStoragePersistenceRequest();
    request(true);
    await settle();
    expect(persisted).toHaveBeenCalledOnce();
    expect(persist).not.toHaveBeenCalled();
  });

  it("does not inspect storage in an insecure context", async () => {
    const persist = vi.fn();
    const persisted = vi.fn();
    vi.stubGlobal("isSecureContext", false);
    vi.stubGlobal("navigator", { storage: { persist, persisted } });
    const request = createStoragePersistenceRequest();
    request(true);
    await settle();
    expect(persisted).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it("ignores a rejected check without retrying or logging", async () => {
    const log = vi.spyOn(console, "error");
    const persist = vi.fn();
    const persisted = vi.fn().mockRejectedValue(new Error("Unavailable"));
    vi.stubGlobal("navigator", { storage: { persist, persisted } });
    const request = createStoragePersistenceRequest();
    request(true);
    await settle();
    request(true);
    await settle();
    expect(persisted).toHaveBeenCalledOnce();
    expect(persist).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
