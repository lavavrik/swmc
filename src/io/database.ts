/**
 * The one place that opens the browser database.
 *
 * Both the project library and the record of which folders the player has
 * chosen live here. They have to agree on a version — opening the same
 * database at two versions fails, which is a mistake that only shows up once
 * both features are used in the same session.
 */
const DATABASE = 'swmc'
const VERSION = 2

export const PROJECTS = 'projects'
export const SETTINGS = 'settings'

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(SETTINGS)) db.createObjectStore(SETTINGS)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('could not open the database'))
  })
}

/** Runs one request against a store and resolves with its result. */
export function transact<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(store, mode).objectStore(store))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error(`${store} request failed`))
      }),
  )
}
