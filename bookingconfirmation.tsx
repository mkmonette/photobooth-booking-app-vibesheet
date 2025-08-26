export async function fetchBookingByRef(ref: string): Promise<Booking | null> {
  return new Promise((resolve) => {
    // simulate async, keep fast but allow UI to show loading when desired
    setTimeout(() => {
      try {
        const raw = localStorage.getItem("bookings");
        if (!raw) {
          resolve(null);
          return;
        }
        const data = JSON.parse(raw);
        if (!Array.isArray(data)) {
          resolve(null);
          return;
        }
        const found = data.find(
          (b) => b && typeof b === "object" && String((b as any).ref) === String(ref)
        );
        resolve((found as Booking) ?? null);
      } catch (_err) {
        // malformed storage
        resolve(null);
      }
    }, 150); // small delay
  });
}

function formatCurrency(cents?: number) {
  if (typeof cents !== "number") return "?";
  const dollars = cents / 100;
  return dollars.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function safeParseDateString(dateString?: string): Date | null {
  if (!dateString) return null;

  const trimmed = dateString.trim();

  // ISO-like full datetime or date (YYYY-MM-DD or YYYY-MM-DDTHH:MM)
  if (/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(trimmed)) {
    const d = new Date(trimmed);
    if (!Number.isNaN(d.getTime())) return d;
  }

  // time-only formats HH:mm or HH:mm:ss
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    const parts = trimmed.split(":").map((p) => parseInt(p, 10));
    if (parts.every((n) => Number.isFinite(n))) {
      const now = new Date();
      const d = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        parts[0],
        parts[1] ?? 0,
        parts[2] ?? 0
      );
      return d;
    }
  }

  // fallback to Date constructor as last resort
  const fallback = new Date(trimmed);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function formatDate(dateString?: string) {
  if (!dateString) return "?";
  const d = safeParseDateString(dateString);
  if (!d) return dateString;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatTimeRange(start?: string, end?: string, durationMinutes?: number) {
  const sDate = safeParseDateString(start);
  const eDate = safeParseDateString(end);

  try {
    if (sDate && eDate) {
      const s = sDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const e = eDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return `${s} ? ${e}`;
    }

    if (sDate) {
      const s = sDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (typeof durationMinutes === "number") return `${s} ? ${durationMinutes} min`;
      return s;
    }

    if (typeof durationMinutes === "number") return `${durationMinutes} min`;
  } catch {
    // ignore formatting errors and fall through to default
  }

  // best-effort fallbacks: if start or end were provided but couldn't be parsed, try to return the raw strings
  if (start && end) return `${start} ? ${end}`;
  if (start) return start;
  return "?";
}

export default function BookingConfirmationPage(): JSX.Element {
  const params = useParams<{ ref?: string }>();
  const location = useLocation();
  const search = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const refFromParams = params.ref;
  const refFromQuery = search.get("ref") ?? undefined;
  const bookingRef = refFromParams ?? refFromQuery;

  const [booking, setBooking] = useState<Booking | null | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(!!bookingRef);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let mounted = true;
    setError(null);

    if (!bookingRef) {
      setBooking(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchBookingByRef(bookingRef)
      .then((b) => {
        if (!mounted) return;
        setBooking(b);
        setLoading(false);
        if (!b) setError("Booking not found for the provided reference.");
      })
      .catch(() => {
        if (!mounted) return;
        setBooking(null);
        setLoading(false);
        setError("Unable to load booking. Please try again.");
      });

    return () => {
      mounted = false;
    };
  }, [bookingRef]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadJson = () => {
    if (!booking) return;
    const blob = new Blob([JSON.stringify(booking, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `booking-${String(booking.ref ?? "unknown")}.json`;
    document.body.appendChild(a);
    // trigger click
    a.click();
    // remove node
    a.remove();
    // revoke after a short delay to ensure the download starts in all browsers
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }, 1000);
  };

  const handleCopyRef = async () => {
    if (!booking?.ref) return;
    const text = String(booking.ref);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // fallback to legacy approach
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // best-effort fallback using DOM method
      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // ignore if copy fails
      }
    }
  };

  return (
    <main
      aria-labelledby="booking-confirmation-heading"
      style={{
        padding: "16px",
        maxWidth: 920,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, 'Helvetica Neue', Arial",
        color: "var(--text-color, #0f172a)",
      }}
    >
      <header style={{ marginBottom: 20 }}>
        <h1 id="booking-confirmation-heading" style={{ fontSize: 20, margin: 0 }}>
          Booking confirmation
        </h1>
        <p style={{ marginTop: 6, color: "var(--muted, #475569)" }}>
          {bookingRef
            ? `Reference: ${bookingRef}`
            : "No booking reference provided. Check the link or enter your reference."}
        </p>
      </header>

      <section aria-live="polite" role="status" style={{ minHeight: 120 }}>
        {loading ? (
          <div
            role="progressbar"
            aria-busy="true"
            style={{
              padding: 20,
              borderRadius: 8,
              background: "rgba(99,102,241,0.06)",
              color: "var(--muted, #475569)",
            }}
          >
            Loading booking?
          </div>
        ) : error ? (
          <div
            role="alert"
            style={{
              padding: 16,
              borderRadius: 8,
              background: "rgba(239,68,68,0.06)",
              color: "var(--danger, #b91c1c)",
            }}
          >
            <strong style={{ display: "block", marginBottom: 6 }}>Could not load booking</strong>
            <div style={{ marginBottom: 8 }}>{error}</div>
            <div style={{ fontSize: 13, color: "var(--muted, #475569)" }}>
              If you believe this is an error, check that the reference is correct or contact the
              business.
            </div>
          </div>
        ) : booking ? (
          <article
            aria-label="Booking details"
            style={{
              padding: 18,
              borderRadius: 12,
              background: "var(--card-bg, #fff)",
              boxShadow: "0 1px 2px rgba(2,6,23,0.08)",
              border: "1px solid rgba(2,6,23,0.04)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
              <div style={{ flex: "1 1 auto" }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>{booking.packageName ?? "Photobooth Booking"}</h2>
                <p style={{ margin: "6px 0 0", color: "var(--muted, #475569)" }}>
                  Booked by {booking.fullName ?? "Guest"}
                </p>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{formatCurrency(booking.priceCents)}</div>
                <div style={{ fontSize: 12, color: "var(--muted, #475569)" }}>
                  Ref: <span style={{ fontFamily: "monospace" }}>{booking.ref}</span>
                </div>
              </div>
            </div>

            <hr style={{ margin: "16px 0", borderColor: "rgba(2,6,23,0.06)" }} />

            <dl style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, margin: 0 }}>
              <div>
                <dt style={{ fontSize: 12, color: "var(--muted, #475569)", marginBottom: 4 }}>Date</dt>
                <dd style={{ margin: 0 }}>{formatDate(booking.date)}</dd>
              </div>

              <div>
                <dt style={{ fontSize: 12, color: "var(--muted, #475569)", marginBottom: 4 }}>Time</dt>
                <dd style={{ margin: 0 }}>
                  {formatTimeRange(booking.startTime, booking.endTime, booking.durationMinutes)}
                </dd>
              </div>

              <div>
                <dt style={{ fontSize: 12, color: "var(--muted, #475569)", marginBottom: 4 }}>Contact</dt>
                <dd style={{ margin: 0 }}>
                  <div>{booking.email ?? "?"}</div>
                  <div style={{ color: "var(--muted, #475569)", marginTop: 6 }}>{booking.phone ?? ""}</div>
                </dd>
              </div>

              {booking.notes ? (
                <div>
                  <dt style={{ fontSize: 12, color: "var(--muted, #475569)", marginBottom: 4 }}>Notes</dt>
                  <dd style={{ margin: 0, whiteSpace: "pre-wrap" }}>{booking.notes}</dd>
                </div>
              ) : null}

              <div>
                <dt style={{ fontSize: 12, color: "var(--muted, #475569)", marginBottom: 4 }}>Created</dt>
                <dd style={{ margin: 0 }}>{formatDate(booking.createdAt)}</dd>
              </div>
            </dl>

            <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handlePrint}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(2,6,23,0.08)",
                  background: "linear-gradient(180deg,#fff,#f8fafc)",
                  cursor: "pointer",
                }}
                aria-label="Print booking"
              >
                Print
              </button>

              <button
                type="button"
                onClick={handleDownloadJson}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(2,6,23,0.08)",
                  background: "linear-gradient(180deg,#fff,#f8fafc)",
                  cursor: "pointer",
                }}
                aria-label="Download booking as JSON"
              >
                Download JSON
              </button>

              <button
                type="button"
                onClick={handleCopyRef}
                disabled={!booking.ref}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(2,6,23,0.08)",
                  background: copied ? "rgba(34,197,94,0.12)" : "linear-gradient(180deg,#fff,#f8fafc)",
                  cursor: booking.ref ? "pointer" : "not-allowed",
                }}
                aria-label="Copy booking reference"
              >
                {copied ? "Copied" : "Copy reference"}
              </button>
            </div>
          </article>
        ) : (
          <div
            style={{
              padding: 16,
              borderRadius: 8,
              background: "rgba(15,23,42,0.03)",
              color: "var(--muted, #475569)",
            }}
          >
            <p style={{ margin: 0 }}>
              No booking found. Check that the reference in the link is correct or contact the business for
              assistance.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}