const AUTH_KEY = "adminAuth";
const BOOKINGS_KEY = "bookings";

/* Utility: check auth existence and expiration (safe for SSR) */
export function requireAuth(): boolean {
  try {
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") return false;
    const raw = window.localStorage.getItem(AUTH_KEY);
    if (!raw) return false;
    const auth: AdminAuth = JSON.parse(raw);
    if (!auth?.token) return false;
    if (auth.expiresAt) {
      const expires = new Date(auth.expiresAt).getTime();
      if (isNaN(expires)) return false;
      if (Date.now() > expires) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/* Utility: clear auth and redirect to signin (or homepage) ? safe for SSR */
export function signOut(): void {
  try {
    if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
      window.localStorage.removeItem(AUTH_KEY);
    }
  } catch {
    // ignore
  }
  try {
    if (typeof window !== "undefined") {
      // client-side navigation fallback
      window.location.href = "/signin";
    }
  } catch {
    // no-op
  }
}

/* Load bookings from localStorage with safe parsing (safe for SSR) */
function loadBookings(): Booking[] {
  try {
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") return [];
    const raw = window.localStorage.getItem(BOOKINGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Normalize minimal fields
    return parsed.map((b: any) => ({
      id: String(b.id ?? `${Date.now()}-${Math.random()}`),
      name: String(b.name ?? "Unknown"),
      email: b.email ?? "",
      phone: b.phone ?? "",
      date: b.date ?? b.createdAt ?? new Date().toISOString(),
      createdAt: b.createdAt ?? new Date().toISOString(),
      notes: b.notes ?? "",
      package: b.package ?? "Standard",
      status: (b.status as BookingStatus) ?? "pending",
      ...b,
    }));
  } catch {
    return [];
  }
}

/* Persist bookings (no-op on SSR) */
function saveBookings(bookings: Booking[]) {
  try {
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") return;
    window.localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings));
  } catch {
    // ignore write errors (quota, etc.)
  }
}

/* Format date to readable string */
function formatDate(iso?: string) {
  try {
    const d = iso ? new Date(iso) : new Date();
    return d.toLocaleString();
  } catch {
    return String(iso ?? "");
  }
}

/* Parse date value to sortable number with consistent handling of invalid dates */
function parseDateForSort(value?: string | number | Date, sortDir: "asc" | "desc"): number {
  const t = new Date(value as any).getTime();
  if (!isNaN(t)) return t;
  // Place invalid dates at the end regardless of sort direction:
  // For ascending (oldest first), return +Infinity so invalid go last.
  // For descending (newest first), return -Infinity so invalid go last.
  return sortDir === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
}

/* Export CSV helper (DOM-safe) */
function exportCSV(bookings: Booking[]) {
  if (!bookings || bookings.length === 0) return;
  if (typeof window === "undefined" || typeof document === "undefined" || typeof URL === "undefined")
    return;

  try {
    const headers = [
      "id",
      "name",
      "email",
      "phone",
      "date",
      "createdAt",
      "package",
      "status",
      "notes",
    ];
    const lines = [
      headers.join(","),
      ...bookings.map((b) =>
        headers
          .map((h) => {
            const v = (b as any)[h] ?? "";
            // Escape quotes and commas
            const s = String(v).replace(/"/g, '""');
            return `"${s}"`;
          })
          .join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    a.download = `bookings-${ts}.csv`;
    // append/click/remove pattern
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
      a.remove();
    }, 100);
  } catch {
    // ignore
  }
}

/* Small accessible button */
function IconButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      style={{
        border: "1px solid transparent",
        background: "transparent",
        padding: "6px 10px",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: 14,
      }}
    />
  );
}

export default function AdminDashboard(): JSX.Element {
  const [bookings, setBookings] = useState<Booking[]>(() => loadBookings());
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | BookingStatus>("all");
  const [sortBy, setSortBy] = useState<"date" | "createdAt">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Redirect if not authenticated; only on client
    if (typeof window === "undefined") return;
    if (!requireAuth()) {
      // small delay to allow UI to render a bit if necessary
      setTimeout(() => {
        try {
          window.location.href = "/signin";
        } catch {
          // ignore
        }
      }, 150);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Keep local state synced with localStorage (in case other tabs update)
    if (typeof window === "undefined") return;
    const handler = () => {
      setBookings(loadBookings());
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  useEffect(() => {
    // persist bookings on change
    saveBookings(bookings);
  }, [bookings]);

  const counts = useMemo(() => {
    const total = bookings.length;
    const pending = bookings.filter((b) => b.status === "pending").length;
    const approved = bookings.filter((b) => b.status === "approved").length;
    const rejected = bookings.filter((b) => b.status === "rejected").length;
    return { total, pending, approved, rejected };
  }, [bookings]);

  const filtered = useMemo(() => {
    let list = bookings.slice();
    if (statusFilter !== "all") {
      list = list.filter((b) => b.status === statusFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (b) =>
          String(b.name).toLowerCase().includes(q) ||
          String(b.email ?? "").toLowerCase().includes(q) ||
          String(b.phone ?? "").toLowerCase().includes(q) ||
          String(b.package ?? "").toLowerCase().includes(q) ||
          String(b.notes ?? "").toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      const av = parseDateForSort(a[sortBy], sortDir);
      const bv = parseDateForSort(b[sortBy], sortDir);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return list;
  }, [bookings, statusFilter, query, sortBy, sortDir]);

  function updateStatus(id: string, status: BookingStatus) {
    setBusy(true);
    setBookings((prev) => {
      const next = prev.map((b) => (b.id === id ? { ...b, status } : b));
      return next;
    });
    setTimeout(() => setBusy(false), 300);
  }

  function removeBooking(id: string) {
    // Use client confirm only when available
    const allowed =
      typeof window === "undefined" || typeof window.confirm === "undefined"
        ? true
        : window.confirm("Are you sure you want to delete this booking? This action cannot be undone.");
    if (!allowed) return;
    setBookings((prev) => prev.filter((b) => b.id !== id));
  }

  function clearAll() {
    const allowed =
      typeof window === "undefined" || typeof window.confirm === "undefined"
        ? true
        : window.confirm("Clear all bookings? This cannot be undone.");
    if (!allowed) return;
    setBookings([]);
  }

  function handleExport() {
    exportCSV(filtered);
  }

  // Helper to copy text to clipboard with fallbacks
  function copyToClipboard(text: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
      return;
    }
    // Fallback to execCommand (requires document)
    if (typeof document === "undefined") return;
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      // prevent scroll
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    } catch {
      // ignore
    }
  }

  return (
    <div
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: 16,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
        color: "var(--text, #0f172a)",
      }}
      role="main"
    >
      <header
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>Admin Dashboard</h1>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>
            Manage photobooth bookings for your business
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => {
              signOut();
            }}
            aria-label="Sign out"
            style={{
              background: "#ef4444",
              color: "white",
              border: "none",
              padding: "8px 12px",
              borderRadius: 8,
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <section
        aria-labelledby="overview-heading"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: "linear-gradient(90deg,#f8fafc,#fff)",
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          }}
        >
          <div style={{ fontSize: 12, color: "#6b7280" }}>Total</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{counts.total}</div>
        </div>
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: "linear-gradient(90deg,#f0fdf4,#fff)",
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          }}
        >
          <div style={{ fontSize: 12, color: "#047857" }}>Approved</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{counts.approved}</div>
        </div>
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: "linear-gradient(90deg,#fff7ed,#fff)",
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          }}
        >
          <div style={{ fontSize: 12, color: "#b45309" }}>Pending</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{counts.pending}</div>
        </div>
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: "linear-gradient(90deg,#fff1f2,#fff)",
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          }}
        >
          <div style={{ fontSize: 12, color: "#be123c" }}>Rejected</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{counts.rejected}</div>
        </div>
      </section>

      <section
        aria-labelledby="controls-heading"
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 12,
          alignItems: "center",
        }}
      >
        <label style={{ position: "relative", flex: "1 1 220px" }}>
          <span className="sr-only">Search bookings</span>
          <input
            aria-label="Search bookings"
            placeholder="Search by name, email, phone, package..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              fontSize: 14,
            }}
          />
        </label>

        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            fontSize: 14,
            background: "white",
          }}
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>

        <select
          aria-label="Sort by"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            fontSize: 14,
            background: "white",
          }}
        >
          <option value="date">Booking date</option>
          <option value="createdAt">Created at</option>
        </select>

        <select
          aria-label="Sort direction"
          value={sortDir}
          onChange={(e) => setSortDir(e.target.value as any)}
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            fontSize: 14,
            background: "white",
          }}
        >
          <option value="desc">Newest first</option>
          <option value="asc">Oldest first</option>
        </select>

        <button
          onClick={() => handleExport()}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: "#111827",
            color: "white",
          }}
        >
          Export CSV
        </button>

        <button
          onClick={() => clearAll()}
          aria-label="Clear all bookings"
          title="Clear all bookings"
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #fde68a",
            background: "#fef3c7",
          }}
        >
          Clear all
        </button>
      </section>

      <section
        aria-labelledby="list-heading"
        style={{
          marginBottom: 24,
        }}
      >
        <h2 id="list-heading" style={{ margin: "0 0 8px 0", fontSize: 16 }}>
          Bookings ({filtered.length})
        </h2>

        {filtered.length === 0 ? (
          <div
            role="status"
            aria-live="polite"
            style={{
              padding: 20,
              borderRadius: 8,
              border: "1px dashed #e5e7eb",
              color: "#6b7280",
            }}
          >
            No bookings match your filters.
          </div>
        ) : (
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "grid",
              gap: 8,
            }}
          >
            {filtered.map((b) => (
              <li
                key={b.id}
                style={{
                  padding: 12,
                  borderRadius: 8,
                  border: "1px solid #e6edf3",
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{b.name}</div>
                    <div style={{ fontSize: 13, color: "#6b7280" }}>{b.package}</div>
                    <div
                      style={{
                        marginLeft: 6,
                        padding: "2px 8px",
                        borderRadius: 999,
                        fontSize: 12,
                        background:
                          b.status === "approved"
                            ? "#ecfdf5"
                            : b.status === "rejected"
                            ? "#fff1f2"
                            : "#fffbeb",
                        color: b.status === "approved" ? "#065f46" : b.status === "rejected" ? "#9f1239" : "#92400e",
                      }}
                      aria-label={`Status: ${b.status}`}
                    >
                      {b.status}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: "#374151", marginTop: 6 }}>
                    <span style={{ marginRight: 12 }}>Booking: {formatDate(b.date)}</span>
                    <span style={{ marginRight: 12 }}>Created: {formatDate(b.createdAt)}</span>
                    {b.email ? <span style={{ marginRight: 12 }}>Email: {b.email}</span> : null}
                    {b.phone ? <span>Phone: {b.phone}</span> : null}
                  </div>
                  {b.notes ? (
                    <div style={{ marginTop: 8, fontSize: 13, color: "#4b5563" }}>{b.notes}</div>
                  ) : null}
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {b.status !== "approved" && (
                    <IconButton
                      onClick={() => updateStatus(b.id, "approved")}
                      title="Approve booking"
                      aria-label={`Approve booking for ${b.name}`}
                      style={{
                        background: "#10b981",
                        color: "white",
                        border: "none",
                        padding: "8px 10px",
                        borderRadius: 6,
                        fontSize: 13,
                      }}
                    >
                      Approve
                    </IconButton>
                  )}
                  {b.status !== "rejected" && (
                    <IconButton
                      onClick={() => updateStatus(b.id, "rejected")}
                      title="Reject booking"
                      aria-label={`Reject booking for ${b.name}`}
                      style={{
                        background: "#ef4444",
                        color: "white",
                        border: "none",
                        padding: "8px 10px",
                        borderRadius: 6,
                        fontSize: 13,
                      }}
                    >
                      Reject
                    </IconButton>
                  )}

                  <IconButton
                    onClick={() => {
                      const text = `${b.name} ? ${formatDate(b.date)}${b.email ? ` ? ${b.email}` : ""}${
                        b.phone ? ` ? ${b.phone}` : ""
                      }`;
                      copyToClipboard(text);
                    }}
                    title="Copy summary"
                    aria-label={`Copy summary for ${b.name}`}
                  >
                    Copy
                  </IconButton>

                  <IconButton
                    onClick={() => removeBooking(b.id)}
                    title="Delete booking"
                    aria-label={`Delete booking for ${b.name}`}
                    style={{ color: "#dc2626" }}
                  >
                    Delete
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer style={{ color: "#6b7280", fontSize: 13 }}>
        <div>
          Data is stored locally in your browser. Use "Export CSV" to download a copy. Changes affect local
          storage only.
        </div>
        <div style={{ marginTop: 8 }}>
          <button
            onClick={() => {
              setBookings(loadBookings());
            }}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              background: "white",
              marginRight: 8,
            }}
          >
            Refresh
          </button>
          <button
            onClick={() => {
              signOut();
            }}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "none",
              background: "#ef4444",
              color: "white",
            }}
          >
            Sign out
          </button>
        </div>
      </footer>

      {busy && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.04)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              padding: 12,
              background: "white",
              borderRadius: 8,
              boxShadow: "0 4px 16px rgba(2,6,23,0.08)",
              pointerEvents: "auto",
            }}
          >
            Saving...
          </div>
        </div>
      )}
    </div>
  );
}