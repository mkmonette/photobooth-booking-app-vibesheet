function parseLocalDateTime(s: string): Date | null {
  if (typeof s !== "string") return null;
  // Accept "YYYY-MM-DDTHH:mm" or "YYYY-MM-DDTHH:mm:ss"
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/
  );
  if (!m) return null;
  const [, yr, mo, day, hh, mm, ss] = m;
  const year = Number(yr);
  const month = Number(mo) - 1;
  const date = Number(day);
  const hour = Number(hh);
  const minute = Number(mm);
  const second = ss ? Number(ss) : 0;
  const dt = new Date(year, month, date, hour, minute, second, 0);
  if (isNaN(dt.getTime())) return null;
  return dt;
}

/**
 * Returns a local "datetime-local" compatible string "YYYY-MM-DDTHH:mm"
 */
export function normalizeToLocalISO(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Check availability by comparing the requested interval against bookings stored in localStorage.
 * The function expects a Date object representing the requested start in local time.
 * Bookings in localStorage are expected to have ISO timestamps (startISO, endISO) which may include timezone offsets.
 */
export async function checkAvailability(
  date: Date,
  durationMinutes: number,
  packageId?: string | null
): Promise<boolean> {
  // Simulate async work / network latency
  await new Promise((res) => setTimeout(res, 300));

  // Normalize requested interval
  const start = new Date(date);
  const end = new Date(start.getTime() + durationMinutes * 60_000);

  // Load stored bookings from localStorage
  // Expected format in localStorage: bookings = [{ id, startISO, endISO, packageId? }, ...]
  const raw = localStorage.getItem("bookings");
  if (!raw) return true;
  let bookings: Array<{ startISO: string; endISO: string; packageId?: string }>;
  try {
    bookings = JSON.parse(raw);
    if (!Array.isArray(bookings)) return true;
  } catch {
    return true;
  }

  // Check overlap: intervals [a,b) and [c,d) overlap if a < d && b > c
  for (const bkg of bookings) {
    // If packageId is provided and you want to ignore conflicts for different packages,
    // you can skip below check. For single-resource bookings, we check all packages.
    // Here we check all bookings (single photobooth) ? adjust as needed.
    const bStart = new Date(bkg.startISO);
    const bEnd = new Date(bkg.endISO);
    if (isNaN(bStart.getTime()) || isNaN(bEnd.getTime())) continue;

    // If package-specific logic is desired (e.g., separate resources per packageId),
    // implement that here. Current behavior checks all bookings.
    const overlap = start < bEnd && end > bStart;
    if (overlap) return false;
  }

  return true;
}

export default function DateTimePicker({
  value,
  onChange,
  minDate,
  maxDate,
  durationMinutes = 60,
  packageId,
}: DateTimePickerProps): JSX.Element {
  const [inputValue, setInputValue] = useState<string>(() => {
    if (value) {
      try {
        const parsed = new Date(value);
        if (!isNaN(parsed.getTime())) return normalizeToLocalISO(parsed);
      } catch {}
    }
    return "";
  });
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const debounceRef = useRef<number | null>(null);
  // Store a composite key to avoid stale dedupe behavior when related parameters change
  const lastCheckedRef = useRef<string | null>(null);

  // Ensure controlled input follows external value prop
  useEffect(() => {
    if (!value) {
      setInputValue("");
      setAvailable(null);
      return;
    }
    try {
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) {
        const local = normalizeToLocalISO(parsed);
        setInputValue(local);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const minAttr = useMemo(() => {
    if (!minDate) return undefined;
    try {
      const d = new Date(minDate);
      if (isNaN(d.getTime())) return undefined;
      return normalizeToLocalISO(d);
    } catch {
      return undefined;
    }
  }, [minDate]);

  const maxAttr = useMemo(() => {
    if (!maxDate) return undefined;
    try {
      const d = new Date(maxDate);
      if (isNaN(d.getTime())) return undefined;
      return normalizeToLocalISO(d);
    } catch {
      return undefined;
    }
  }, [maxDate]);

  // Clear lastCheckedRef when any of the parameters that affect availability change.
  useEffect(() => {
    lastCheckedRef.current = null;
  }, [durationMinutes, packageId, minAttr, maxAttr]);

  useEffect(() => {
    // Cleanup debounce on unmount
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // When inputValue changes, validate min/max and check availability after debounce
    if (!inputValue) {
      setAvailable(null);
      setChecking(false);
      return;
    }

    // Validate min/max (string compare is fine for "YYYY-MM-DDTHH:mm" values)
    if (minAttr && inputValue < minAttr) {
      setAvailable(false);
      setChecking(false);
      return;
    }
    if (maxAttr && inputValue > maxAttr) {
      setAvailable(false);
      setChecking(false);
      return;
    }

    // Build a composite dedupe key that includes parameters that affect availability
    const dedupeKey = `${inputValue}|${durationMinutes ?? ""}|${packageId ?? ""}|${minAttr ??
      ""}|${maxAttr ?? ""}`;

    // Avoid duplicate checks for same composite key
    if (lastCheckedRef.current === dedupeKey) {
      return;
    }

    setChecking(true);
    setAvailable(null);

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(async () => {
      debounceRef.current = null;

      // Parse local datetime-local string to Date (treated as local)
      const date = parseLocalDateTime(inputValue);
      if (!date) {
        setAvailable(false);
        setChecking(false);
        return;
      }
      try {
        const ok = await checkAvailability(date, durationMinutes, packageId ?? undefined);
        setAvailable(ok);
        setChecking(false);
        lastCheckedRef.current = dedupeKey;
        if (ok) {
          // Emit an unambiguous representation: full ISO timestamp (UTC) so consumers have timezone info.
          onChange(date.toISOString());
        }
      } catch {
        setAvailable(false);
        setChecking(false);
      }
    }, 450);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue, minAttr, maxAttr, durationMinutes, packageId]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label htmlFor="datetime-picker" style={{ fontSize: 14, fontWeight: 600 }}>
        Pick date & time
      </label>

      <input
        id="datetime-picker"
        aria-label="Date and time"
        type="datetime-local"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        min={minAttr}
        max={maxAttr}
        style={{
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid var(--border, #ccc)",
          fontSize: 16,
        }}
      />

      <div aria-live="polite" style={{ minHeight: 20, fontSize: 14 }}>
        {checking && (
          <span style={{ color: "var(--muted, #666)" }}>Checking availability?</span>
        )}
        {!checking && available === true && (
          <span style={{ color: "var(--success, #0a7f3b)" }}>Available</span>
        )}
        {!checking && available === false && (
          <span style={{ color: "var(--danger, #c53030)" }}>
            Unavailable ? please choose a different time
          </span>
        )}
      </div>
    </div>
  );
}