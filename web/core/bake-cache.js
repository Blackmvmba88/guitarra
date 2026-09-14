const DB_NAME = "blackmamba-pick";
const DB_VERSION = 1;
const STORE = "bakes";
export const ANALYZER_VERSION = "0.2.0-bake";

export function makeBakeKey(sourceHash, sensitivity) {
  return `${ANALYZER_VERSION}:${sourceHash}:${Number(sensitivity).toFixed(2)}`;
}

export async function hashArrayBuffer(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function getBakedMap(key) {
  const db = await openDb();
  return requestResult(db.transaction(STORE, "readonly").objectStore(STORE).get(key));
}

export async function putBakedMap(key, value) {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put({ key, ...value, savedAt: Date.now() });
  await transactionDone(tx);
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
