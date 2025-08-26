const LARGE_BLOB_THRESHOLD = 100 * 1024 // 100 KB
const APP_NAME = 'photobooth-booking-v2'
const BACKUP_VERSION = '1.0.0'

type ExportOptions = { includeLargeBlobs?: boolean }
type ImportOptions = { overwrite?: boolean; allowCrossAppImport?: boolean }

type BackupMeta = {
  app: string
  version: string
  createdAt: string
  itemCount: number
}

type BackupItem = {
  value: string
  size: number
  skipped?: boolean
}

type BackupFile = {
  meta: BackupMeta
  data: Record<string, BackupItem>
}

type ValidationResult = {
  valid: boolean
  errors?: string[]
  warnings?: string[]
}

/**
 * Calculate UTF-8 byte length of a string in a robust way:
 * - Prefer TextEncoder when available.
 * - Fallback to encodeURIComponent-based approximation otherwise.
 */
function utf8ByteLength(str: string): number {
  try {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(str).length
    }
  } catch {
    // fall through to fallback
  }
  // Fallback: encodeURIComponent then count bytes by replacing percent-encodings with a single char
  // This yields the number of bytes for UTF-8 encoded string.
  return encodeURIComponent(str).replace(/%[A-F\d]{2}/g, 'x').length
}

/**
 * Validate that an object conforms to the expected backup schema.
 * Separates strict errors from non-fatal warnings (e.g., size mismatches).
 */
export function validateBackupSchema(obj: any): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (typeof obj !== 'object' || obj === null) {
    errors.push('Backup is not an object')
    return { valid: false, errors }
  }

  if (!('meta' in obj)) {
    errors.push('Missing meta property')
  } else if (typeof obj.meta !== 'object' || obj.meta === null) {
    errors.push('meta must be an object')
  } else {
    const meta = obj.meta
    // meta.app mismatch is non-fatal here; import step should decide whether to accept cross-app backups
    if (meta.app !== APP_NAME) {
      warnings.push(`meta.app is "${meta.app}" which does not match running app "${APP_NAME}"`)
    }
    if (typeof meta.version !== 'string') {
      errors.push('meta.version must be a string')
    }
    if (typeof meta.createdAt !== 'string' || Number.isNaN(Date.parse(meta.createdAt))) {
      errors.push('meta.createdAt must be an ISO8601 date string')
    }
    if (typeof meta.itemCount !== 'number' || !Number.isFinite(meta.itemCount) || meta.itemCount < 0) {
      errors.push('meta.itemCount must be a non-negative number')
    }
  }

  if (!('data' in obj)) {
    errors.push('Missing data property')
  } else if (typeof obj.data !== 'object' || obj.data === null || Array.isArray(obj.data)) {
    errors.push('data must be an object keyed by localStorage keys')
  } else {
    const data = obj.data
    let counted = 0
    for (const [k, v] of Object.entries(data)) {
      counted++
      if (typeof k !== 'string') {
        errors.push('data keys must be strings')
        break
      }
      if (typeof v !== 'object' || v === null) {
        errors.push(`data["${k}"] must be an object`)
        continue
      }
      if (typeof v.value !== 'string') {
        errors.push(`data["${k}"].value must be a string`)
      }
      if (typeof v.size !== 'number' || !Number.isFinite(v.size) || v.size < 0) {
        errors.push(`data["${k}"].size must be a non-negative number`)
      } else {
        // size should match value length in bytes (approximate). Non-fatal warning.
        try {
          const actual = utf8ByteLength(v.value)
          if (actual !== v.size) {
            warnings.push(`data["${k}"].size (${v.size}) does not match actual bytes (${actual})`)
          }
        } catch {
          // If encoding fails unexpectedly, mark as warning
          warnings.push(`Could not verify byte size for data["${k}"]`)
        }
      }
      if ('skipped' in v && typeof v.skipped !== 'boolean') {
        errors.push(`data["${k}"].skipped must be a boolean if present`)
      }
    }
    // Optional: verify itemCount matches counted -> non-fatal warning
    if (obj.meta && typeof obj.meta.itemCount === 'number' && counted !== obj.meta.itemCount) {
      warnings.push(`meta.itemCount (${obj.meta.itemCount}) does not match number of data keys (${counted})`)
    }
  }

  const valid = errors.length === 0
  return {
    valid,
    errors: errors.length ? errors : undefined,
    warnings: warnings.length ? warnings : undefined
  }
}

/**
 * Export current localStorage into a backup JSON string.
 * - includeLargeBlobs: if false, values > LARGE_BLOB_THRESHOLD are replaced with a placeholder item indicating they were skipped.
 * Returns a JSON string (UTF-8 text).
 */
export async function exportBackup(options: ExportOptions = {}): Promise<string> {
  const includeLargeBlobs = !!options.includeLargeBlobs
  const data: Record<string, BackupItem> = {}
  const keys: string[] = []

  // Collect a snapshot of keys. Wrap in try/catch because localStorage access can throw in some environments.
  try {
    const len = localStorage.length
    for (let i = 0; i < len; i++) {
      try {
        const key = localStorage.key(i)
        if (key !== null) keys.push(key)
      } catch {
        // If localStorage.key(i) throws for any index, skip that index but continue trying others
      }
    }
  } catch (err) {
    // In case localStorage is not accessible (private mode, SSR), throw
    throw new Error('Unable to access localStorage: ' + String(err))
  }

  for (const key of keys) {
    try {
      // Re-check existence and read value. localStorage.getItem may throw in some environments.
      let raw: string | null
      try {
        raw = localStorage.getItem(key)
      } catch {
        // If the key is no longer available or reading fails, mark skipped placeholder
        raw = null
      }
      const value = raw === null ? '' : raw
      const size = utf8ByteLength(value)
      if (!includeLargeBlobs && size > LARGE_BLOB_THRESHOLD) {
        data[key] = {
          value: '',
          size,
          skipped: true
        }
      } else {
        data[key] = {
          value,
          size
        }
      }
    } catch {
      // If we can't read or process a specific key, include a placeholder
      data[key] = {
        value: '',
        size: 0,
        skipped: true
      }
    }
  }

  const meta: BackupMeta = {
    app: APP_NAME,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    itemCount: Object.keys(data).length
  }

  const backup: BackupFile = { meta, data }

  return JSON.stringify(backup)
}

/**
 * Import from a backup JSON string into localStorage.
 * - overwrite: if false, existing localStorage keys will not be overwritten.
 * - allowCrossAppImport: if false (default), abort if backup.meta.app does not match APP_NAME.
 * Returns count of imported items and any warnings generated.
 */
export async function importBackup(
  json: string,
  options: ImportOptions = {}
): Promise<{ imported: number; warnings: string[] }> {
  const warnings: string[] = []
  const overwrite = !!options.overwrite
  const allowCrossAppImport = !!options.allowCrossAppImport
  let parsed: any

  try {
    parsed = JSON.parse(json)
  } catch (err) {
    throw new Error('Invalid JSON: ' + String(err))
  }

  const validation = validateBackupSchema(parsed)
  if (!validation.valid) {
    const errs = validation.errors || []
    // Treat schema errors as warnings for now only if the core data is present; otherwise abort.
    warnings.push('Backup failed schema validation: ' + errs.join('; '))
    if (!parsed || typeof parsed !== 'object' || typeof parsed.data !== 'object' || parsed.data === null) {
      throw new Error('Backup data missing or invalid; aborting import')
    }
  }

  // Surface non-fatal warnings from validation
  if (validation.warnings && validation.warnings.length) {
    for (const w of validation.warnings) warnings.push('Validation warning: ' + w)
  }

  // Enforce app match unless caller explicitly allows cross-app import
  const metaApp = parsed && parsed.meta && typeof parsed.meta.app === 'string' ? parsed.meta.app : null
  if (metaApp && metaApp !== APP_NAME) {
    if (!allowCrossAppImport) {
      throw new Error(
        `Backup app "${metaApp}" does not match this application ("${APP_NAME}"). To import anyway, set allowCrossAppImport: true.`
      )
    } else {
      warnings.push(`Importing backup for different app "${metaApp}" into "${APP_NAME}" as allowCrossAppImport=true`)
    }
  }

  const data = parsed.data as Record<string, BackupItem>
  let imported = 0

  for (const [key, item] of Object.entries(data)) {
    if (!item || typeof item !== 'object') {
      warnings.push(`Skipping key "${key}" because item is malformed`)
      continue
    }
    if (item.skipped) {
      warnings.push(`Skipping key "${key}" because it was marked as skipped in backup (large value not included)`)
      continue
    }
    if (!('value' in item) || typeof item.value !== 'string') {
      warnings.push(`Skipping key "${key}" because it has no string value`)
      continue
    }

    try {
      const exists = (() => {
        try {
          return localStorage.getItem(key) !== null
        } catch {
          // If we cannot read existing key, treat as existing to avoid accidental overwrite
          return true
        }
      })()
      if (exists && !overwrite) {
        warnings.push(`Did not import "${key}" because it already exists and overwrite is false`)
        continue
      }
      localStorage.setItem(key, item.value)
      imported++
    } catch (err) {
      warnings.push(`Failed to import "${key}": ${String(err)}`)
    }
  }

  return { imported, warnings }
}

/**
 * Estimate the size in bytes of a full backup (including all large blobs).
 */
export async function estimateBackupSize(): Promise<number> {
  // Build a backup including large blobs to get an accurate estimate
  const json = await exportBackup({ includeLargeBlobs: true })
  try {
    return utf8ByteLength(json)
  } catch {
    // Fallback: approximate using string length (may differ for multi-byte)
    return json.length
  }
}