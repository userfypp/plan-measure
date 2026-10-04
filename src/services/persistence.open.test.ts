import { beforeEach, describe, expect, it, vi } from "vitest";

const { deleteDBMock, openDBMock } = vi.hoisted(() => ({
  deleteDBMock: vi.fn(),
  openDBMock: vi.fn(),
}));

vi.mock("idb", () => ({ deleteDB: deleteDBMock, openDB: openDBMock }));

describe("IndexedDB opening", () => {
  beforeEach(() => {
    vi.resetModules();
    openDBMock.mockReset();
    deleteDBMock.mockReset();
  });

  it("allows a later open attempt after the first one rejects", async () => {
    const database = {
      transaction: vi.fn(() => ({
        done: Promise.resolve(),
        objectStore: vi.fn((name: string) => ({
          get: vi.fn((key: string) =>
            Promise.resolve(
              name === "sessions" && key === "persistence-v2"
                ? { key: "persistence-v2", activeRevision: null }
                : undefined,
            ),
          ),
        })),
      })),
    };
    openDBMock.mockRejectedValueOnce(new Error("temporary open failure")).mockResolvedValueOnce(database);

    const { loadSavedSession } = await import("./persistence");

    await expect(loadSavedSession()).rejects.toThrow("temporary open failure");
    await expect(loadSavedSession()).resolves.toBeNull();
    expect(openDBMock).toHaveBeenCalledTimes(2);
  });

  it("does not let callbacks from an old connection invalidate its replacement", async () => {
    const database = () => ({
      close: vi.fn(),
      transaction: vi.fn(() => ({
        done: Promise.resolve(),
        objectStore: vi.fn((name: string) => ({
          get: vi.fn((key: string) =>
            Promise.resolve(
              name === "sessions" && key === "persistence-v2"
                ? { key: "persistence-v2", activeRevision: null }
                : undefined,
            ),
          ),
        })),
      })),
    });
    const first = database();
    const second = database();
    openDBMock.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const { loadSavedSession } = await import("./persistence");
    await loadSavedSession();
    const callbacks = openDBMock.mock.calls[0]![2];
    callbacks.blocking();
    expect(first.close).toHaveBeenCalledOnce();
    await loadSavedSession();
    callbacks.terminated();
    await expect(loadSavedSession()).resolves.toBeNull();
    expect(openDBMock).toHaveBeenCalledTimes(2);
    expect(second.transaction).toHaveBeenCalledTimes(2);
    expect(second.close).not.toHaveBeenCalled();
  });
});
