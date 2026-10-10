type StoragePersistence = Pick<StorageManager, "persist" | "persisted">;

interface StorageEnvironment {
  secure: boolean;
  storage?: Partial<StoragePersistence>;
}

/** One best-effort request per page, triggered only by a confirmed content save. */
export function createStoragePersistenceRequest(
  environment: () => StorageEnvironment = () => {
    const secure = globalThis.isSecureContext === true;
    return { secure, storage: secure ? globalThis.navigator?.storage : undefined };
  },
) {
  let attempted = false;
  return (hasContent: boolean): void => {
    if (!hasContent || attempted) return;
    attempted = true;
    // Detach both the capability check and permission request from the save queue.
    void Promise.resolve()
      .then(async () => {
        const { secure, storage } = environment();
        if (!secure || !storage?.persist || !storage.persisted) return;
        if ((await storage.persisted()) === false) await storage.persist();
      })
      .catch(() => undefined);
  };
}

export const requestPersistentStorageAfterSave = createStoragePersistenceRequest();
