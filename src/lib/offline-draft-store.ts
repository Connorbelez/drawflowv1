export interface OfflineDraftStore<T extends { key: string }> {
  delete(key: string): Promise<void>;
  load(key: string): Promise<T | null>;
  save(value: T): Promise<void>;
}

export function createOfflineDraftStore<T extends { key: string }>(input: {
  databaseName: string;
  databaseVersion?: number;
  storeName?: string;
}): OfflineDraftStore<T> {
  const storeName = input.storeName ?? "drafts";
  const openDatabase = async (): Promise<IDBDatabase | null> => {
    if (typeof indexedDB === "undefined") {
      return null;
    }
    return await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(
        input.databaseName,
        input.databaseVersion ?? 1
      );
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  };

  return {
    async delete(key) {
      const database = await openDatabase();
      if (!database) {
        return;
      }
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction(storeName, "readwrite");
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.objectStore(storeName).delete(key);
        });
      } finally {
        database.close();
      }
    },
    async load(key) {
      const database = await openDatabase();
      if (!database) {
        return null;
      }
      try {
        return await new Promise<T | null>((resolve, reject) => {
          const request = database
            .transaction(storeName, "readonly")
            .objectStore(storeName)
            .get(key);
          request.onsuccess = () =>
            resolve((request.result as T | undefined) ?? null);
          request.onerror = () => reject(request.error);
        });
      } finally {
        database.close();
      }
    },
    async save(value) {
      const database = await openDatabase();
      if (!database) {
        return;
      }
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction(storeName, "readwrite");
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.objectStore(storeName).put(value);
        });
      } finally {
        database.close();
      }
    },
  };
}
