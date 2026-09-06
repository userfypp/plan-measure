import { beforeEach, describe, expect, it, vi } from "vitest";

const { deleteDBMock, openDBMock } = vi.hoisted(() => ({
  deleteDBMock: vi.fn(),
  openDBMock: vi.fn(),
}));

vi.mock("idb", () => ({ deleteDB: deleteDBMock, openDB: openDBMock }));

describe("IndexedDB opening", () => {
  beforeEach(() => {
    openDBMock.mockReset();
    deleteDBMock.mockReset();
  });

  it("allows a later open attempt after the first one rejects", async () => {
    const database = {
      transaction: vi.fn(() => ({
        done: Promise.resolve(),
        objectStore: vi.fn((name: string) => ({
          get: vi
            .fn()
            .mockResolvedValue(
              name === "sessions" ? { key: "persistence-v2", activeRevision: null } : undefined,
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
});
