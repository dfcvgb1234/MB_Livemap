const DB_NAME = "mb-livemap";
const STORE = "files";
const KEY = "map-image";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open image storage"));
  });
}

export async function loadMapImage(): Promise<Blob | null> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result instanceof Blob ? result : null);
      };
      request.onerror = () => reject(request.error ?? new Error("Could not read the map image"));
    });
  } finally {
    db.close();
  }
}

export async function saveMapImage(blob: Blob): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(blob, KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Could not save the map image"));
    });
  } finally {
    db.close();
  }
}

export async function clearMapImage(): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE, "readwrite").objectStore(STORE).delete(KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Could not remove the map image"));
    });
  } finally {
    db.close();
  }
}
