const DATABASE_NAME = "flow-studio-media";
const STORE_NAME = "assets";
const DATABASE_VERSION = 1;

interface StoredMedia {
  id: string;
  blob: Blob;
  updatedAt: string;
}

const memoryFallback = new Map<string, StoredMedia>();
const writers = new Map<string, Promise<void>>();
const retained = new Map<string, number>();
const listeners = new Map<string, Set<() => void>>();

export function retainStudioMedia(id: string) {
  retained.set(id, (retained.get(id) ?? 0) + 1);
  return () => { const remaining = (retained.get(id) ?? 1) - 1; if (remaining > 0) retained.set(id, remaining); else retained.delete(id); };
}

export function subscribeStudioMedia(id: string, listener: () => void) {
  const group = listeners.get(id) ?? new Set<() => void>();
  group.add(listener); listeners.set(id, group);
  return () => { group.delete(listener); if (!group.size) listeners.delete(id); };
}

function publish(id: string) { listeners.get(id)?.forEach((listener) => listener()); }

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Media storage transaction was aborted."));
    transaction.onerror = () => reject(transaction.error ?? new Error("Media storage transaction failed."));
  });
}

function openDatabase(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === "undefined") return Promise.resolve(undefined);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Media storage could not be opened."));
    request.onblocked = () => reject(new Error("Media storage is busy in another Flow tab."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Media storage operation failed."));
  });
}

async function persistMedia(id: string, blob: Blob) {
  const record: StoredMedia = { id, blob, updatedAt: new Date().toISOString() };
  const database = await openDatabase();
  if (!database) { memoryFallback.set(id, record); return; }
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const complete = transactionComplete(transaction);
    transaction.objectStore(STORE_NAME).put(record);
    await complete;
  } finally { database.close(); }
}

export function putStudioMedia(id: string, blob: Blob) {
  const previous = writers.get(id) ?? Promise.resolve();
  const write = previous.catch(() => undefined).then(async () => {
    await persistMedia(id, blob);
    const readback = await getStudioMedia(id);
    if (!readback || readback.size !== blob.size || readback.type !== blob.type) throw new Error("The stored recording could not be verified.");
    publish(id);
  });
  writers.set(id, write);
  void write.finally(() => { if (writers.get(id) === write) writers.delete(id); }).catch(() => undefined);
  return write;
}

export async function getStudioMedia(id: string): Promise<Blob | undefined> {
  const database = await openDatabase();
  if (!database) return memoryFallback.get(id)?.blob;
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const record = await requestResult(transaction.objectStore(STORE_NAME).get(id)) as StoredMedia | undefined;
    return record?.blob;
  } finally { database.close(); }
}

async function deleteMedia(id: string, mayDelete: () => boolean) {
  const database = await openDatabase();
  if (!mayDelete()) { database?.close(); return; }
  if (!database) { memoryFallback.delete(id); publish(id); return; }
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const complete = transactionComplete(transaction);
    transaction.objectStore(STORE_NAME).delete(id);
    await complete;
  } finally { database.close(); }
  publish(id);
}

export function deleteStudioMedia(id: string, mayDelete: () => boolean = () => true) {
  const previous = writers.get(id) ?? Promise.resolve();
  const deletion = previous.catch(() => undefined).then(() => deleteMedia(id, mayDelete));
  writers.set(id, deletion);
  void deletion.finally(() => { if (writers.get(id) === deletion) writers.delete(id); }).catch(() => undefined);
  return deletion;
}

export async function listStoredMediaIds(): Promise<string[]> {
  const database = await openDatabase();
  if (!database) return [...memoryFallback.keys()];
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    return (await requestResult(transaction.objectStore(STORE_NAME).getAllKeys())).map(String);
  } finally { database.close(); }
}

export async function removeOrphanedStudioMedia(referencedIds: ReadonlySet<string> | (() => ReadonlySet<string>)) {
  const ids = await listStoredMediaIds();
  for (const id of ids) {
    const isOrphan = () => !(typeof referencedIds === "function" ? referencedIds() : referencedIds).has(id) && !retained.has(id);
    // Check again after opening storage. A concurrent recording/reference may
    // become owned during that asynchronous boundary.
    if (isOrphan() && !writers.has(id)) await deleteStudioMedia(id, isOrphan);
  }
}

export function mediaObjectUrl(blob: Blob) {
  return URL.createObjectURL(blob);
}
