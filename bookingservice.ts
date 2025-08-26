const STORAGE_KEY = 'pb_bookings_v1';
const ALLOWED_STATUSES: Set<string> = new Set([
  'draft',
  'booked',
  'confirmed',
  'cancelled',
  'completed',
]);

function nowIso(): string {
  return new Date().toISOString();
}

function toDate(d: Date | string): Date {
  if (d instanceof Date) return d;
  return new Date(d as any);
}

function dateToIsoSafe(d: Date | string | undefined | null): string | null {
  try {
    if (d === undefined || d === null) return null;
    const dt = toDate(d as Date | string);
    if (isNaN(dt.getTime())) return null;
    return dt.toISOString();
  } catch {
    return null;
  }
}

function ensureISO(d: Date | string): string {
  const iso = dateToIsoSafe(d);
  if (!iso) throw new Error('Invalid date');
  return iso;
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
    return (crypto as any).randomUUID();
  }
  return 'b_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function safeParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    console.error('Failed to parse JSON from storage', e);
    return null;
  }
}

function loadAllBookings(): Booking[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  const parsed = safeParseJson<unknown[]>(raw);
  if (!Array.isArray(parsed)) return [];

  const normalized: Booking[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const entry = parsed[i];
    if (!entry || typeof entry !== 'object') {
      console.warn(`Skipping non-object booking entry at index ${i}`);
      continue;
    }
    try {
      const e: any = entry as any;

      const startIso = dateToIsoSafe(e.start);
      const endIso = dateToIsoSafe(e.end);
      // If either date is missing/invalid, skip this record but keep others
      if (!startIso || !endIso) {
        console.warn(`Skipping booking with invalid start/end at index ${i}`, { start: e.start, end: e.end });
        continue;
      }

      const createdAtIso = dateToIsoSafe(e.createdAt) ?? startIso ?? nowIso();
      const updatedAtIso = dateToIsoSafe(e.updatedAt) ?? createdAtIso;

      let durationMinutes: number;
      if (typeof e.durationMinutes === 'number' && Number.isFinite(e.durationMinutes) && e.durationMinutes > 0) {
        durationMinutes = Math.round(e.durationMinutes);
      } else {
        const s = new Date(startIso).getTime();
        const en = new Date(endIso).getTime();
        durationMinutes = Math.max(1, Math.round((en - s) / 60000));
      }

      const status = (typeof e.status === 'string' && ALLOWED_STATUSES.has(e.status)) ? e.status : 'booked';

      const statusHistoryRaw = Array.isArray(e.statusHistory) ? e.statusHistory : null;
      let statusHistory: Booking['statusHistory'];
      if (statusHistoryRaw) {
        statusHistory = statusHistoryRaw.map((sh: any, idx: number) => {
          const shAt = dateToIsoSafe(sh && sh.at) ?? createdAtIso;
          const shStatus = (sh && typeof sh.status === 'string' && ALLOWED_STATUSES.has(sh.status)) ? sh.status as BookingStatus : status as BookingStatus;
          return {
            status: shStatus,
            at: shAt,
            reason: sh && typeof sh.reason === 'string' ? sh.reason : undefined,
          };
        });
        if (statusHistory.length === 0) {
          statusHistory = [{
            status: status as BookingStatus,
            at: createdAtIso,
            reason: undefined,
          }];
        }
      } else {
        statusHistory = [{
          status: status as BookingStatus,
          at: createdAtIso,
          reason: undefined,
        }];
      }

      const booking: Booking = {
        id: typeof e.id === 'string' && e.id.trim().length > 0 ? e.id : generateId(),
        createdAt: createdAtIso,
        updatedAt: updatedAtIso,
        start: startIso,
        end: endIso,
        durationMinutes,
        packageId: (typeof e.packageId === 'string' && e.packageId.length > 0) ? e.packageId : null,
        customer: (e && typeof e.customer === 'object') ? e.customer : null,
        status: status as BookingStatus,
        statusHistory,
        price: typeof e.price === 'number' ? e.price : null,
        notes: (typeof e.notes === 'string') ? e.notes : null,
      };

      normalized.push(booking);
    } catch (err) {
      console.warn(`Failed to normalize booking at index ${i}, skipping`, err);
      continue;
    }
  }

  return normalized;
}

function saveAllBookings(bookings: Booking[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
  } catch (e) {
    console.error('Failed to save bookings to localStorage', e);
  }
}

function clone<T>(v: T): T {
  // Prefer structuredClone when available (preserves Date/Map/Set etc.)
  try {
    if (typeof (globalThis as any).structuredClone === 'function') {
      return (globalThis as any).structuredClone(v) as T;
    }
  } catch {
    // fallthrough to JSON clone
  }
  return JSON.parse(JSON.stringify(v)) as T;
}

/**
 * createBooking(draft: BookingDraft): Promise<{id: string}>
 */
export async function createBooking(draft: BookingDraft): Promise<{ id: string }> {
  if (!draft || (draft.start === undefined && draft.end === undefined)) {
    throw new Error('start or end must be provided');
  }

  let startDate: Date;
  let endDate: Date;

  if (draft.start) {
    startDate = toDate(draft.start);
    if (isNaN(startDate.getTime())) throw new Error('Invalid start date');
    if (draft.end) {
      endDate = toDate(draft.end);
      if (isNaN(endDate.getTime())) throw new Error('Invalid end date');
    } else {
      const duration = typeof draft.durationMinutes === 'number' && draft.durationMinutes > 0 ? draft.durationMinutes : 30;
      endDate = new Date(startDate.getTime() + duration * 60000);
    }
  } else {
    endDate = toDate(draft.end as string);
    if (isNaN(endDate.getTime())) throw new Error('Invalid end date');
    const duration = typeof draft.durationMinutes === 'number' && draft.durationMinutes > 0 ? draft.durationMinutes : 30;
    startDate = new Date(endDate.getTime() - duration * 60000);
  }

  if (endDate <= startDate) {
    throw new Error('end must be after start');
  }

  const durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);

  const id = generateId();
  const ts = nowIso();

  const status = (draft.status && ALLOWED_STATUSES.has(draft.status)) ? draft.status as BookingStatus : 'booked';

  const booking: Booking = {
    id,
    createdAt: ts,
    updatedAt: ts,
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    durationMinutes,
    packageId: typeof draft.packageId === 'string' ? draft.packageId : null,
    customer: (draft.customer && typeof draft.customer === 'object') ? draft.customer : null,
    status,
    statusHistory: [
      {
        status,
        at: ts,
        reason: typeof draft['statusReason'] === 'string' ? draft['statusReason'] : undefined,
      },
    ],
    price: typeof draft.price === 'number' ? draft.price : null,
    notes: typeof draft.notes === 'string' ? draft.notes : null,
  };

  const all = loadAllBookings();
  all.push(booking);
  saveAllBookings(all);

  return { id };
}

/**
 * getBooking(id: string): Promise<Booking | null>
 */
export async function getBooking(id: string): Promise<Booking | null> {
  if (!id) return null;
  const all = loadAllBookings();
  const found = all.find((b) => b.id === id) || null;
  return found ? clone(found) : null;
}

/**
 * listBookings(filter?: any): Promise<Booking[]>
 * Supported filter keys:
 * - from: Date|string
 * - to: Date|string
 * - status: string | string[]
 * - packageId: string
 * - search: string (matches customer name, email, phone)
 * - sortBy: 'start'|'createdAt'|'updatedAt' (default 'start')
 * - sortDir: 'asc'|'desc' (default 'asc')
 * - limit: number
 * - page: number (1-based)
 */
export async function listBookings(filter?: any): Promise<Booking[]> {
  let results = loadAllBookings();

  if (filter) {
    if (filter.from) {
      const from = toDate(filter.from).getTime();
      if (!isNaN(from)) {
        results = results.filter((b) => {
          const bEndIso = dateToIsoSafe(b.end);
          if (!bEndIso) return false;
          return new Date(bEndIso).getTime() > from;
        });
      }
    }
    if (filter.to) {
      const to = toDate(filter.to).getTime();
      if (!isNaN(to)) {
        results = results.filter((b) => {
          const bStartIso = dateToIsoSafe(b.start);
          if (!bStartIso) return false;
          return new Date(bStartIso).getTime() < to;
        });
      }
    }
    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      results = results.filter((b) => statuses.includes(b.status));
    }
    if (filter.packageId) {
      results = results.filter((b) => b.packageId === filter.packageId);
    }
    if (filter.search && typeof filter.search === 'string') {
      const q = filter.search.trim().toLowerCase();
      if (q.length > 0) {
        results = results.filter((b) => {
          const c = b.customer || ({} as any);
          const matches = (
            (c.name && typeof c.name === 'string' && c.name.toLowerCase().includes(q)) ||
            (c.email && typeof c.email === 'string' && c.email.toLowerCase().includes(q)) ||
            (c.phone && typeof c.phone === 'string' && c.phone.toLowerCase().includes(q)) ||
            (b.id && b.id.toLowerCase().includes(q))
          );
          return !!matches;
        });
      }
    }
  }

  const allowedSortBy = ['start', 'createdAt', 'updatedAt'] as const;
  const allowedSortDir = ['asc', 'desc'] as const;

  const sortByRaw = filter && typeof filter.sortBy === 'string' ? filter.sortBy : undefined;
  const sortDirRaw = filter && typeof filter.sortDir === 'string' ? filter.sortDir : undefined;

  const sortBy: 'start' | 'createdAt' | 'updatedAt' = (allowedSortBy.includes(sortByRaw as any) ? (sortByRaw as any) : 'start');
  const sortDir: 'asc' | 'desc' = (allowedSortDir.includes(sortDirRaw as any) ? (sortDirRaw as any) : 'asc');

  results.sort((a, b) => {
    const aIso = dateToIsoSafe((a as any)[sortBy]);
    const bIso = dateToIsoSafe((b as any)[sortBy]);

    const ta = aIso ? new Date(aIso).getTime() : Number.POSITIVE_INFINITY;
    const tb = bIso ? new Date(bIso).getTime() : Number.POSITIVE_INFINITY;

    if (ta === tb) return 0;
    return sortDir === 'asc' ? (ta - tb) : (tb - ta);
  });

  if (filter && typeof filter.limit === 'number') {
    const limit = Math.max(1, Math.floor(filter.limit));
    const page = (filter && typeof filter.page === 'number' && filter.page > 0) ? Math.floor(filter.page) : 1;
    const startIndex = (page - 1) * limit;
    results = results.slice(startIndex, startIndex + limit);
  }

  return results.map(clone);
}

/**
 * checkAvailability(date: Date, durationMinutes: number, packageId?: string): Promise<boolean>
 * returns true if the time slot [date, date+duration) is free (no overlap with existing bookings)
 */
export async function checkAvailability(date: Date, durationMinutes: number, packageId?: string): Promise<boolean> {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error('Invalid date');
  }
  if (typeof durationMinutes !== 'number' || durationMinutes <= 0) {
    throw new Error('durationMinutes must be a positive number');
  }

  const start = date.getTime();
  const end = start + Math.round(durationMinutes) * 60000;
  if (end <= start) throw new Error('end must be after start');

  const all = loadAllBookings();

  for (const b of all) {
    if (b.status === 'cancelled') continue;

    if (typeof packageId !== 'undefined' && packageId !== null) {
      if (b.packageId && b.packageId !== packageId) continue;
    }

    const bStartIso = dateToIsoSafe(b.start);
    const bEndIso = dateToIsoSafe(b.end);

    if (!bStartIso || !bEndIso) {
      // skip malformed booking entries for availability checks
      continue;
    }

    const bStart = new Date(bStartIso).getTime();
    const bEnd = new Date(bEndIso).getTime();

    // Overlap detection: start < bEnd && end > bStart
    if (start < bEnd && end > bStart) {
      return false;
    }
  }

  return true;
}

/**
 * updateBookingStatus(id: string, status: string, reason?: string): Promise<void>
 */
export async function updateBookingStatus(id: string, status: string, reason?: string): Promise<void> {
  if (!id) throw new Error('id is required');
  if (!status || !ALLOWED_STATUSES.has(status)) throw new Error('Invalid status');

  const all = loadAllBookings();
  const idx = all.findIndex((b) => b.id === id);
  if (idx === -1) throw new Error('Booking not found');

  const now = nowIso();
  const b = all[idx];

  if (!Array.isArray(b.statusHistory)) {
    b.statusHistory = [{
      status: b.status || 'booked',
      at: b.createdAt || now,
      reason: undefined,
    }];
  }

  // append history entry
  const entry = {
    status: status as BookingStatus,
    reason: typeof reason === 'string' ? reason : undefined,
    at: now,
  };

  // if status unchanged we still record attempt
  if (b.status === status) {
    b.statusHistory = b.statusHistory.concat(entry);
    b.updatedAt = now;
    saveAllBookings(all);
    return;
  }

  b.status = status as BookingStatus;
  b.updatedAt = now;
  b.statusHistory = b.statusHistory.concat(entry);

  saveAllBookings(all);
}