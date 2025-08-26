const bookingWeakMap = new WeakMap<Booking, string>();
const signatureCounter = new Map<string, number>();
let fallbackCounter = 1;

const makeRandomId = () => {
  if (typeof crypto !== "undefined" && typeof (crypto as any).randomUUID === "function") {
    try {
      return (crypto as any).randomUUID();
    } catch {
      // fallthrough
    }
  }
  // predictable fallback (stable during runtime)
  return `gen-${Date.now().toString(36)}-${String(fallbackCounter++)}`;
};

const signatureFor = (b?: Booking) =>
  b ? `${b.id ?? b.bookingId ?? ""}|${String(b.customerName ?? "")}|${String(b.date ?? "")}|${String(b.time ?? "")}|${String(b.service ?? "")}|${String(b.price ?? "")}|${String(b.status ?? "")}` : "";

const safeId = (b?: Booking) => {
  if (!b) return makeRandomId();

  // existing explicit id fields take precedence
  if (b.id) return String(b.id);
  if (b.bookingId) return String(b.bookingId);

  // 1) If we have the same object reference, return the memoized id
  const existing = bookingWeakMap.get(b);
  if (existing) return existing;

  // 2) Use a signature-based approach and a counter to avoid collisions
  const baseSig = signatureFor(b);
  const currentCount = signatureCounter.get(baseSig) ?? 0;
  const nextCount = currentCount + 1;
  signatureCounter.set(baseSig, nextCount);
  const sigKey = currentCount === 0 ? baseSig : `${baseSig}#${nextCount}`;

  const id = makeRandomId() + (sigKey ? `-${Math.abs(hashString(sigKey))}` : "");
  bookingWeakMap.set(b, id);
  return id;
};

// simple hash helper to produce short numeric suffix from a string
function hashString(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0; // convert to 32bit integer
  }
  return h;
}

/* Formatters and utilities */

const formatDate = (input?: string | number) => {
  if (!input) return "?";
  try {
    const d = typeof input === "number" ? new Date(input) : new Date(input);
    if (isNaN(d.getTime())) return String(input);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return String(input);
  }
};

const formatTime = (time?: string) => {
  if (!time) return "";
  try {
    // Accept both "HH:MM" and full ISO times
    const t = time.includes("T") ? new Date(time) : new Date(`1970-01-01T${time}`);
    if (!isNaN(t.getTime())) return t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {}
  return time;
};

const formatCurrency = (n?: number) =>
  typeof n === "number"
    ? n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 })
    : "?";

const statusClass = (status?: string) => {
  switch (String(status ?? "").toLowerCase()) {
    case "confirmed":
      return "status-badge status-confirmed";
    case "pending":
      return "status-badge status-pending";
    case "cancelled":
      return "status-badge status-cancelled";
    case "completed":
      return "status-badge status-completed";
    default:
      return "status-badge status-unknown";
  }
};

/* BookingRow Component */

export const BookingRow: React.FC<BookingRowProps> = ({ booking, onAction, onSelect }) => {
  const id = safeId(booking);
  const handleSelect = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      onSelect?.(id);
      onAction?.("select", id);
    },
    [id, onAction, onSelect]
  );

  const handleEdit = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      onAction?.("edit", id);
    },
    [id, onAction]
  );

  const handleCancel = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      onAction?.("cancel", id);
    },
    [id, onAction]
  );

  const { customerName, date, time, service, price, status, thumbnail, notes } = booking ?? {};

  // compute machine-readable dateTime only when we can produce a valid ISO timestamp
  let dateTimeIso: string | undefined;
  if (typeof date === "number") {
    const d = new Date(date);
    if (!isNaN(d.getTime())) dateTimeIso = d.toISOString();
  } else if (typeof date === "string") {
    const parsed = Date.parse(date);
    if (!isNaN(parsed)) dateTimeIso = new Date(parsed).toISOString();
  }

  return (
    <li
      className="booking-row"
      role="listitem"
      aria-label={`Booking ${customerName ?? id}`}
      tabIndex={0}
      onClick={handleSelect}
      onKeyDown={(e) => {
        // support Enter and Space activation across browsers
        if (e.key === "Enter" || e.code === "Space" || e.key === " " || e.key === "Spacebar") {
          e.preventDefault();
          handleSelect();
        }
      }}
    >
      <div className="booking-row__left">
        <div className="booking-row__thumb" aria-hidden={true}>
          {thumbnail ? (
            // eslint-disable-next-line jsx-a11y/img-redundant-alt
            <img src={thumbnail} alt={`Thumbnail for ${customerName ?? "booking"}`} className="booking-row__img" />
          ) : (
            <div className="booking-row__avatar" aria-hidden={true}>
              {String(customerName ?? id).slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
        <div className="booking-row__meta">
          <div className="booking-row__name">{customerName ?? "Unnamed"}</div>
          <div className="booking-row__service">{service ?? "Photobooth"}</div>
          {notes ? <div className="booking-row__notes">{notes}</div> : null}
        </div>
      </div>

      <div className="booking-row__center">
        <div className="booking-row__datetime">
          <time dateTime={dateTimeIso ?? undefined}>
            {formatDate(date)}
            {time ? ` ? ${formatTime(time)}` : ""}
          </time>
        </div>
        <div className="booking-row__price">{formatCurrency(price)}</div>
      </div>

      <div className="booking-row__right">
        <div className={statusClass(status)} aria-hidden={true}>
          {String(status ?? "unknown").toUpperCase()}
        </div>

        <div className="booking-row__actions" role="group" aria-label={`Actions for booking ${id}`}>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={handleSelect}
            aria-label={`View booking ${customerName ?? id}`}
            title="View"
          >
            View
          </button>

          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={handleEdit}
            aria-label={`Edit booking ${customerName ?? id}`}
            title="Edit"
          >
            Edit
          </button>

          <button
            type="button"
            className="btn btn-sm btn-danger"
            onClick={handleCancel}
            aria-label={`Cancel booking ${customerName ?? id}`}
            title="Cancel"
            disabled={String(status ?? "").toLowerCase() === "cancelled"}
          >
            Cancel
          </button>
        </div>
      </div>
    </li>
  );
};

/* BookingList Component */

const BookingList: React.FC<BookingListProps> = ({ bookings, onSelect, onAction }) => {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<"date_desc" | "date_asc" | "name_asc">("date_desc");

  // normalized bookings with an internal _id that is stable for the lifetime of this module/runtime
  const normalized = useMemo(() => {
    return (bookings ?? []).map((b) => ({ ...b, _id: safeId(b) }));
  }, [bookings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return normalized
      .filter((b) => {
        if (statusFilter !== "all") {
          if (String(b.status ?? "").toLowerCase() !== statusFilter) return false;
        }
        if (!q) return true;
        return (
          String(b.customerName ?? "").toLowerCase().includes(q) ||
          String(b.service ?? "").toLowerCase().includes(q) ||
          String(b._id ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortKey === "name_asc") {
          return String(a.customerName ?? "").localeCompare(String(b.customerName ?? ""));
        }
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db = b.date ? new Date(b.date).getTime() : 0;
        return sortKey === "date_desc" ? db - da : da - db;
      });
  }, [normalized, query, statusFilter, sortKey]);

  const handleAction = useCallback(
    (action: string, id: string) => {
      onAction?.(action, id);
    },
    [onAction]
  );

  const handleSelect = useCallback(
    (id: string) => {
      onSelect?.(id);
      onAction?.("select", id);
    },
    [onAction, onSelect]
  );

  return (
    <section className="booking-list" aria-label="Bookings">
      <header className="booking-list__header">
        <div className="booking-list__title">
          <h2>Bookings</h2>
          <span className="booking-list__count" aria-live="polite">
            {filtered.length} {filtered.length === 1 ? "booking" : "bookings"}
          </span>
        </div>

        <div className="booking-list__controls">
          <label className="sr-only" htmlFor="booking-search">
            Search bookings
          </label>
          <input
            id="booking-search"
            type="search"
            className="input input-search"
            placeholder="Search by name, service or id"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search bookings"
          />

          <label className="sr-only" htmlFor="filter-status">
            Filter by status
          </label>
          <select
            id="filter-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="select"
            aria-label="Filter bookings by status"
          >
            <option value="all">All</option>
            <option value="confirmed">Confirmed</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <label className="sr-only" htmlFor="sort-by">
            Sort bookings
          </label>
          <select
            id="sort-by"
            value={sortKey}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "date_desc" || v === "date_asc" || v === "name_asc") {
                setSortKey(v);
              }
            }}
            className="select"
            aria-label="Sort bookings"
          >
            <option value="date_desc">Date ? newest</option>
            <option value="date_asc">Date ? oldest</option>
            <option value="name_asc">Name ? A to Z</option>
          </select>
        </div>
      </header>

      <ul className="booking-list__list" role="list">
        {filtered.length === 0 ? (
          <li className="booking-list__empty" aria-live="polite">
            No bookings found.
          </li>
        ) : (
          filtered.map((b) => (
            <BookingRow
              key={b._id}
              booking={b}
              onAction={(action, id) => handleAction(action, id)}
              onSelect={(id) => handleSelect(id)}
            />
          ))
        )}
      </ul>
    </section>
  );
};

export default BookingList;