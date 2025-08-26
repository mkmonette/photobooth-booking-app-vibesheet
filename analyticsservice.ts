const STORAGE_KEY = 'pb_analytics_v1';
const MAX_EVENTS = 20000; // cap to avoid unbounded growth
const DEFAULT_POPULAR_LIMIT = 5;
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

type Range = { from?: string; to?: string };

interface AnalyticsEvent {
  id: string;
  name: string;
  data?: any;
  timestamp: string; // ISO string
}

interface SummaryStats {
  range: { from: string; to: string };
  totalEvents: number;
  eventsByName: Record<string, number>;
  eventsPerDay: Record<string, number>;
  bookings: number;
  popularPackages: { package: string; count: number }[];
  uniqueUsers: number;
  firstEvent?: string;
  lastEvent?: string;
  avgEventsPerDay: number;
}

/* Environment guards */

function isBrowser(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.document !== 'undefined' && typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

/* Helpers */

function nowISO(): string {
  return new Date().toISOString();
}

function makeId(): string {
  try {
    if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) {
      return (crypto as any).randomUUID();
    }
  } catch {
    // fall through to fallback
  }
  // fallback UUID v4-ish
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    // eslint-disable-next-line no-mixed-operators
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Create a JSON-serializable deep clone of value.
 * - Attempts JSON.parse(JSON.stringify(value)) first (fast path).
 * - On failure, uses a replacer to handle functions, BigInt, and circular refs.
 * Returns a value composed only of JSON-serializable primitives/objects/arrays.
 */
function safeSerializableClone<T>(value: T): T {
  try {
    // Fast path: most values are serializable
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    try {
      const seen = new WeakSet();
      const str = JSON.stringify(value, function (_key, val) {
        // Handle primitives that JSON cannot serialize
        if (typeof val === 'function') return '[Function]';
        if (typeof val === 'bigint') return val.toString();
        if (val && typeof val === 'object') {
          if (seen.has(val)) return '[Circular]';
          seen.add(val);
        }
        return val;
      });
      return JSON.parse(str) as T;
    } catch {
      // Last resort: coerce to a string summary
      try {
        return String(value) as unknown as T;
      } catch {
        return null as unknown as T;
      }
    }
  }
}

function clampEvents(events: AnalyticsEvent[]): AnalyticsEvent[] {
  if (events.length <= MAX_EVENTS) return events;
  return events.slice(-MAX_EVENTS);
}

function toISODateOnly(d: Date): string {
  // YYYY-MM-DD for per-day buckets (local date)
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse range and, when the provided inputs are date-only strings (YYYY-MM-DD),
 * normalize from => start of that day (00:00:00.000 local) and to => end of that day (23:59:59.999 local).
 *
 * If ISO timestamps are provided, they are respected as-is.
 *
 * Returns Date objects and the corresponding ISO strings.
 */
function parseRange(range?: Range): { from: Date; to: Date; fromISO: string; toISO: string } {
  const now = new Date();
  const defaultFrom = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30); // 30 days ago

  let fromDate: Date;
  let toDate: Date;

  if (range?.from) {
    if (DATE_ONLY_REGEX.test(range.from)) {
      // interpret as local start of day
      const [y, m, d] = range.from.split('-').map(n => parseInt(n, 10));
      fromDate = new Date(y, m - 1, d, 0, 0, 0, 0);
    } else {
      const parsed = new Date(range.from);
      fromDate = isNaN(parsed.getTime()) ? defaultFrom : parsed;
    }
  } else {
    fromDate = defaultFrom;
  }

  if (range?.to) {
    if (DATE_ONLY_REGEX.test(range.to)) {
      // interpret as local end of day
      const [y, m, d] = range.to.split('-').map(n => parseInt(n, 10));
      toDate = new Date(y, m - 1, d, 23, 59, 59, 999);
    } else {
      const parsed = new Date(range.to);
      toDate = isNaN(parsed.getTime()) ? now : parsed;
    }
  } else {
    toDate = now;
  }

  // Ensure from <= to
  if (fromDate > toDate) {
    const tmp = fromDate;
    fromDate = toDate;
    toDate = tmp;
  }

  return {
    from: new Date(fromDate.getTime()),
    to: new Date(toDate.getTime()),
    fromISO: new Date(fromDate.getTime()).toISOString(),
    toISO: new Date(toDate.getTime()).toISOString(),
  };
}

/* Storage helpers */

function safeGetItem(key: string): string | null {
  if (!isBrowser()) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // rethrow to allow caller fallback handling
    throw new Error('localStorage.setItem failed');
  }
}

function sanitizeEventForStorage(e: AnalyticsEvent): AnalyticsEvent {
  const cloned: AnalyticsEvent = {
    id: String(e.id),
    name: String(e.name),
    timestamp: new Date(e.timestamp).toISOString(),
  };
  if (e.data !== undefined) {
    cloned.data = safeSerializableClone(e.data);
  }
  return cloned;
}

function loadEvents(): AnalyticsEvent[] {
  if (!isBrowser()) return [];
  try {
    const raw = safeGetItem(STORAGE_KEY);
    const parsed = safeParse<AnalyticsEvent[]>(raw, []);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        e =>
          e &&
          typeof e.name === 'string' &&
          typeof e.timestamp === 'string' &&
          typeof e.id === 'string'
      )
      .map(e => ({
        id: String(e.id),
        name: String(e.name),
        data: e.data,
        timestamp: String(e.timestamp),
      }));
  } catch {
    return [];
  }
}

function saveEvents(events: AnalyticsEvent[]) {
  if (!isBrowser()) return;
  // sanitize events to ensure stored data is JSON-safe
  const sanitized = events.map(sanitizeEventForStorage);
  try {
    safeSetItem(STORAGE_KEY, JSON.stringify(sanitized));
  } catch {
    // If storage fails (quota or other), try to trim and save minimal info
    try {
      const trimmed = sanitized.slice(-Math.floor(MAX_EVENTS / 4));
      safeSetItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // give up silently ? analytics should never break app
    }
  }
}

/* Domain helpers */

function getPackageFromEvent(e: AnalyticsEvent): string | null {
  if (!e || !e.data) return null;
  // common shapes: e.data.package, e.data.booking.package, e.data.booking?.package
  const maybe = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  if (maybe(e.data.package)) return maybe(e.data.package);
  if (e.data.booking && maybe(e.data.booking.package)) return maybe(e.data.booking.package);
  // some events may nest under other keys
  if (e.data.bookingData && maybe(e.data.bookingData.package)) return maybe(e.data.bookingData.package);
  return null;
}

function isBookingEvent(e: AnalyticsEvent): boolean {
  if (!e) return false;
  const name = (e.name || '').toLowerCase();
  if (name.includes('book')) return true;
  const pkg = getPackageFromEvent(e);
  if (pkg) return true;
  if (e.data && (e.data.bookingId || e.data.reservationId)) return true;
  return false;
}

function extractUserKey(e: AnalyticsEvent): string | null {
  if (!e || !e.data) return null;
  const d = e.data as any;
  // Common user identifiers
  if (typeof d.userId === 'string' && d.userId.trim() !== '') return `id:${d.userId}`;
  if (typeof d.email === 'string' && d.email.trim() !== '') return `email:${d.email.toLowerCase()}`;
  if (d.user && typeof d.user.id === 'string' && d.user.id.trim() !== '') return `id:${d.user.id}`;
  if (d.user && typeof d.user.email === 'string' && d.user.email.trim() !== '')
    return `email:${d.user.email.toLowerCase()}`;
  return null;
}

/* Public API */

export function trackEvent(name: string, data?: any): void {
  try {
    if (typeof name !== 'string' || !name.trim()) return;
    const events = loadEvents();
    const ev: AnalyticsEvent = {
      id: makeId(),
      name: name.trim(),
      data: data === undefined ? undefined : safeSerializableClone(data),
      timestamp: nowISO(),
    };
    events.push(ev);
    const trimmed = clampEvents(events);
    saveEvents(trimmed);
  } catch {
    // swallow errors to avoid breaking app
  }
}

export async function getSummaryStats(range?: Range): Promise<SummaryStats> {
  try {
    const { from, to, fromISO, toISO } = parseRange(range);
    const events = loadEvents().filter(e => {
      const t = new Date(e.timestamp);
      if (isNaN(t.getTime())) return false;
      return t.getTime() >= from.getTime() && t.getTime() <= to.getTime();
    });

    const totalEvents = events.length;
    const eventsByName: Record<string, number> = {};
    const eventsPerDay: Record<string, number> = {};
    const packageCounts: Record<string, number> = {};
    const userSet = new Set<string>();
    let bookings = 0;
    let firstEvent: string | undefined = undefined;
    let lastEvent: string | undefined = undefined;

    for (const e of events) {
      // events by name
      eventsByName[e.name] = (eventsByName[e.name] || 0) + 1;

      // per-day bucket (local date)
      const day = toISODateOnly(new Date(e.timestamp));
      eventsPerDay[day] = (eventsPerDay[day] || 0) + 1;

      // first/last
      const ts = new Date(e.timestamp).toISOString();
      if (!firstEvent || ts < firstEvent) firstEvent = ts;
      if (!lastEvent || ts > lastEvent) lastEvent = ts;

      // booking detection
      if (isBookingEvent(e)) {
        bookings += 1;
      }

      // package counts
      const pkg = getPackageFromEvent(e);
      if (pkg) {
        packageCounts[pkg] = (packageCounts[pkg] || 0) + 1;
      }

      // user identifiers
      const userKey = extractUserKey(e);
      if (userKey) userSet.add(userKey);
    }

    // Build popular packages array
    const popularPackagesArr = Object.entries(packageCounts)
      .map(([pkg, count]) => ({ package: pkg, count }))
      .sort((a, b) => b.count - a.count);

    // Average events per day across the inclusive day span (calendar days)
    const startOfFromDay = new Date(from.getTime());
    startOfFromDay.setHours(0, 0, 0, 0);
    const startOfToDay = new Date(to.getTime());
    startOfToDay.setHours(0, 0, 0, 0);
    let daySpan = Math.floor((startOfToDay.getTime() - startOfFromDay.getTime()) / MS_PER_DAY) + 1;
    daySpan = Math.max(1, daySpan);
    const avgEventsPerDay = totalEvents / daySpan;

    return {
      range: { from: fromISO, to: toISO },
      totalEvents,
      eventsByName,
      eventsPerDay,
      bookings,
      popularPackages: popularPackagesArr.slice(0, DEFAULT_POPULAR_LIMIT),
      uniqueUsers: userSet.size,
      firstEvent,
      lastEvent,
      avgEventsPerDay,
    };
  } catch {
    // return a safe empty summary on error
    const now = new Date();
    return {
      range: { from: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30).toISOString(), to: now.toISOString() },
      totalEvents: 0,
      eventsByName: {},
      eventsPerDay: {},
      bookings: 0,
      popularPackages: [],
      uniqueUsers: 0,
      firstEvent: undefined,
      lastEvent: undefined,
      avgEventsPerDay: 0,
    };
  }
}

export async function popularPackages(limit?: number): Promise<{ package: string; count: number }[]> {
  try {
    const events = loadEvents();
    const counts: Record<string, number> = {};
    for (const e of events) {
      const pkg = getPackageFromEvent(e);
      if (pkg) {
        counts[pkg] = (counts[pkg] || 0) + 1;
      }
    }
    const arr = Object.entries(counts)
      .map(([pkg, count]) => ({ package: pkg, count }))
      .sort((a, b) => b.count - a.count);
    const lim = typeof limit === 'number' && limit > 0 ? Math.min(100, Math.floor(limit)) : DEFAULT_POPULAR_LIMIT;
    return arr.slice(0, lim);
  } catch {
    return [];
  }
}