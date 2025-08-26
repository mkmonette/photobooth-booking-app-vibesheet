const META_KEY = '__photobooth_meta__';
const DEFAULT_SCHEMA_VERSION = 1;

type Meta = {
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
};

type InitOptions = {
  schemaVersion?: number;
};

type ImportOptions = {
  overwrite?: boolean;
};

let CURRENT_SCHEMA_VERSION = DEFAULT_SCHEMA_VERSION;
let _storage: Storage | MemoryStorage | null = null;

/**
 * In-memory fallback that implements minimal Storage-like interface.
 */
class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  key(index: number): string | null {
    const keys = Array.from(this.map.keys());
    return keys[index] ?? null;
  }
}

/**
 * Utility: check for localStorage availability.
 */
function detectStorage(): Storage | MemoryStorage {
  try {
    if (typeof window === 'undefined' || !window?.localStorage) {
      return new MemoryStorage();
    }
    const testKey = '__storage_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return window.localStorage;
  } catch {
    return new MemoryStorage();
  }
}

function ensureStorageInitialized(): void {
  if (!_storage) {
    _storage = detectStorage();
  }
}

function getRaw(key: string): string | null {
  ensureStorageInitialized();
  if (_storage instanceof MemoryStorage) {
    return _storage.getItem(key);
  }
  return (_storage as Storage).getItem(key);
}

function setRaw(key: string, value: string): void {
  ensureStorageInitialized();
  if (_storage instanceof MemoryStorage) {
    _storage.setItem(key, value);
    return;
  }
  (_storage as Storage).setItem(key, value);
}

function removeRaw(key: string): void {
  ensureStorageInitialized();
  if (_storage instanceof MemoryStorage) {
    _storage.removeItem(key);
    return;
  }
  (_storage as Storage).removeItem(key);
}

function listKeys(): string[] {
  ensureStorageInitialized();
  if (_storage instanceof MemoryStorage) {
    const ms = _storage as MemoryStorage;
    const keys: string[] = [];
    for (let i = 0; i < ms.length; i++) {
      const k = ms.key(i);
      if (k) keys.push(k);
    }
    return keys;
  }
  const ls = _storage as Storage;
  const keys: string[] = [];
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (k) keys.push(k);
  }
  return keys;
}

/**
 * Parse stored JSON where possible.
 * Returns:
 * - parsed object (T) on success
 * - raw string when value is non-JSON
 * - null when value is missing
 *
 * Note: callers should guard-check the returned type when expecting a specific shape.
 */
function safeParse<T>(value: string | null): T | string | null {
  if (value === null) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    // Return raw string (not force-cast to T) so callers can detect non-JSON values.
    return value;
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    // Fallback: try to coerce to string
    try {
      return String(value);
    } catch {
      return '';
    }
  }
}

/**
 * Get metadata object from storage. If missing or malformed, returns null.
 */
function readMeta(): Meta | null {
  const raw = getRaw(META_KEY);
  const parsed = safeParse<Meta>(raw);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    // further validation: ensure required fields exist and are of expected types
    const maybeMeta = parsed as Meta;
    if (
      typeof maybeMeta.schemaVersion === 'number' &&
      typeof maybeMeta.createdAt === 'string' &&
      typeof maybeMeta.updatedAt === 'string'
    ) {
      return maybeMeta;
    }
  }
  return null;
}

/**
 * Write metadata to storage.
 */
function writeMeta(meta: Partial<Meta> & { schemaVersion: number }): void {
  const now = new Date().toISOString();
  const finalMeta: Meta = {
    schemaVersion: meta.schemaVersion,
    updatedAt: now,
    createdAt: meta.createdAt ?? now,
  };
  setRaw(META_KEY, safeStringify(finalMeta));
}

/**
 * Initialize storage and metadata.
 */
export async function initStorage(options?: InitOptions): Promise<void> {
  CURRENT_SCHEMA_VERSION = options?.schemaVersion ?? DEFAULT_SCHEMA_VERSION;
  _storage = detectStorage();

  try {
    const existing = readMeta();
    if (!existing) {
      const now = new Date().toISOString();
      const meta: Meta = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        createdAt: now,
        updatedAt: now,
      };
      writeMeta(meta);
    } else {
      // If caller provided a newer schema version, update CURRENT_SCHEMA_VERSION and potentially migrate
      if (options?.schemaVersion && options.schemaVersion > existing.schemaVersion) {
        CURRENT_SCHEMA_VERSION = options.schemaVersion;
      } else {
        CURRENT_SCHEMA_VERSION = existing.schemaVersion;
      }
      await migrateIfNeeded();
    }
  } catch (err) {
    // Ensure storage is at least initialized
    const now = new Date().toISOString();
    const meta: Meta = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now,
    };
    try {
      writeMeta(meta);
    } catch {
      // ignore
    }
  }
}

/**
 * Generic getter. Returns parsed value (T), raw string, or null if missing.
 */
export function getItem<T>(key: string): T | string | null {
  try {
    const raw = getRaw(key);
    return safeParse<T>(raw);
  } catch {
    return null;
  }
}

/**
 * Generic setter. Stores JSON-stringified value.
 */
export function setItem<T>(key: string, value: T): void {
  try {
    setRaw(key, safeStringify(value));
    // update meta timestamp
    const meta = readMeta();
    if (meta) {
      writeMeta({
        schemaVersion: meta.schemaVersion,
        createdAt: meta.createdAt,
      });
    }
  } catch {
    // ignore write errors
  }
}

/**
 * Remove a key from storage.
 */
export function removeItem(key: string): void {
  try {
    removeRaw(key);
    const meta = readMeta();
    if (meta) {
      writeMeta({
        schemaVersion: meta.schemaVersion,
        createdAt: meta.createdAt,
      });
    }
  } catch {
    // ignore
  }
}

/**
 * Migration registry.
 * Each migration is an async function that performs transformations on the storage
 * to move from version (n-1) to version n. Keyed by target version number (n).
 */
const MIGRATIONS: Record<
  number,
  (ctx: {
    getItem: typeof getItem;
    setItem: typeof setItem;
    removeItem: typeof removeItem;
    exportState: typeof exportState;
    importState: typeof importState;
  }) => Promise<void>
> = {
  // Example:
  // 2: async ({ getItem, setItem }) => { /* migrate to v2 */ },
};

/**
 * Run migrations if stored schemaVersion is less than CURRENT_SCHEMA_VERSION.
 */
export async function migrateIfNeeded(): Promise<void> {
  const meta = readMeta();
  if (!meta) {
    // nothing to migrate; initialize meta
    const now = new Date().toISOString();
    writeMeta({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      createdAt: now,
    });
    return;
  }

  let fromVersion = meta.schemaVersion;
  const targetVersion = CURRENT_SCHEMA_VERSION;

  if (fromVersion >= targetVersion) {
    // nothing to do
    // but ensure stored meta matches current version (if user requested upgrade)
    if (fromVersion !== targetVersion) {
      writeMeta({
        schemaVersion: targetVersion,
        createdAt: meta.createdAt,
      });
    }
    return;
  }

  // perform migrations sequentially from (fromVersion + 1) up to targetVersion
  for (let v = fromVersion + 1; v <= targetVersion; v++) {
    const migration = MIGRATIONS[v];
    try {
      if (migration) {
        await migration({
          getItem,
          setItem,
          removeItem,
          exportState,
          importState,
        });
      } else {
        // No explicit migration: best-effort no-op (application-specific migrations should be registered above)
      }
      // update meta after each step
      const currentMeta = readMeta();
      writeMeta({
        schemaVersion: v,
        createdAt: currentMeta?.createdAt ?? new Date().toISOString(),
      });
    } catch (err) {
      // If a migration fails, stop further migrations and surface/log the error.
      // Update meta to last successful version.
      const currentMeta = readMeta();
      writeMeta({
        schemaVersion: Math.max(fromVersion, currentMeta?.schemaVersion ?? fromVersion),
        createdAt: currentMeta?.createdAt ?? new Date().toISOString(),
      });
      throw err;
    }
  }
}

/**
 * Export all stored keys and values as a plain object.
 * The metadata key is included under the META_KEY property.
 */
export function exportState(): any {
  const obj: Record<string, unknown> = {};
  try {
    const keys = listKeys();
    keys.forEach((k) => {
      const raw = getRaw(k);
      obj[k] = safeParse(raw);
    });
  } catch {
    // ignore
  }
  return obj;
}

/**
 * Import a state object into storage.
 * If overwrite is true, clears existing storage first.
 * If overwrite is false, merges keys (incoming keys overwrite existing keys).
 * After import, meta schemaVersion is set from imported data if present; otherwise remains.
 */
export async function importState(state: any, options?: ImportOptions): Promise<void> {
  if (!state || typeof state !== 'object') {
    throw new Error('Invalid state object for import');
  }

  try {
    if (options?.overwrite) {
      // preserve nothing; clear via the storage abstraction (safe for MemoryStorage and Storage)
      if (!_storage) _storage = detectStorage();
      const keys = listKeys();
      for (const k of keys) {
        try {
          removeRaw(k);
        } catch {
          // ignore individual removal errors
        }
      }
    }

    // Write entries
    for (const [key, value] of Object.entries(state)) {
      try {
        // If imported value is undefined, skip
        if (typeof value === 'undefined') continue;
        // store raw stringified value
        setRaw(key, safeStringify(value));
      } catch {
        // skip problematic key
      }
    }

    // If imported state contains meta, adopt its schemaVersion, else keep current or meta in storage
    const importedRaw = state[META_KEY];
    const existingMeta = readMeta();
    if (importedRaw && typeof importedRaw === 'object' && typeof importedRaw.schemaVersion === 'number') {
      const importedMeta = importedRaw as Meta;
      writeMeta({
        schemaVersion: importedMeta.schemaVersion,
        createdAt: importedMeta.createdAt ?? existingMeta?.createdAt ?? new Date().toISOString(),
      });
      CURRENT_SCHEMA_VERSION = importedMeta.schemaVersion;
    } else if (existingMeta) {
      // ensure meta timestamp updated
      writeMeta({
        schemaVersion: existingMeta.schemaVersion,
        createdAt: existingMeta.createdAt,
      });
      CURRENT_SCHEMA_VERSION = existingMeta.schemaVersion;
    } else {
      // no meta anywhere: create new meta
      const now = new Date().toISOString();
      writeMeta({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        createdAt: now,
      });
    }

    // After import, attempt migrations if needed
    await migrateIfNeeded();
  } catch (err) {
    throw err;
  }
}