const STORAGE_KEY = "photobooth_bookings_v1";

/* Utility helpers */
const nowISO = () => new Date().toISOString();

const generateId = () =>
  Math.random().toString(36).slice(2, 9) + "-" + Date.now().toString(36);

const loadBookings = (): Booking[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedBookings();
    const parsed = JSON.parse(raw) as Booking[];
    if (!Array.isArray(parsed)) return seedBookings();
    return parsed;
  } catch {
    return seedBookings();
  }
};

const saveBookings = (bookings: Booking[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
  } catch {
    // ignore localStorage write errors in demo
  }
};

const seedBookings = (): Booking[] => {
  const sample: Booking[] = [
    {
      id: generateId(),
      customerName: "Taylor Morgan",
      email: "taylor@example.com",
      phone: "555-1234",
      date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2)
        .toISOString()
        .slice(0, 10),
      time: "18:00",
      createdAt: nowISO(),
      amount: 250,
      notes: "Outdoor event. Needs a backdrop.",
      status: "pending",
      paymentProofRequested: false,
      updatedAt: nowISO(),
    },
    {
      id: generateId(),
      customerName: "Jordan Lee",
      email: "jordan@example.com",
      phone: "555-5678",
      date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)
        .toISOString()
        .slice(0, 10),
      time: "12:00",
      createdAt: nowISO(),
      amount: 150,
      notes: "Corporate event ? 2 hours.",
      status: "payment_requested",
      paymentProofRequested: true,
      updatedAt: nowISO(),
    },
  ];
  saveBookings(sample);
  return sample;
};

/* Main component */
export default function BookingManager(): JSX.Element {
  const [bookings, setBookings] = useState<Booking[]>(() => loadBookings());
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | BookingStatus>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [processingIds, setProcessingIds] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [activeRejectId, setActiveRejectId] = useState<string | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "created" | "customer">("date");

  // Refs for latest bookings (avoid stale closures) and modal focus management
  const bookingsRef = useRef<Booking[]>(bookings);
  useEffect(() => {
    bookingsRef.current = bookings;
  }, [bookings]);

  const prevActiveElementRef = useRef<HTMLElement | null>(null);
  const modalContainerRef = useRef<HTMLDivElement | null>(null);
  const modalFirstFocusRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    saveBookings(bookings);
  }, [bookings]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bookings
      .filter((b) => {
        if (filterStatus !== "all" && b.status !== filterStatus) return false;
        if (!q) return true;
        return (
          b.customerName.toLowerCase().includes(q) ||
          (b.email || "").toLowerCase().includes(q) ||
          (b.phone || "").toLowerCase().includes(q) ||
          (b.notes || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === "date") {
          return a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);
        }
        if (sortBy === "created") {
          return b.createdAt.localeCompare(a.createdAt);
        }
        return a.customerName.localeCompare(b.customerName);
      });
  }, [bookings, query, filterStatus, sortBy]);

  const setProcessing = (id: string, value: boolean) =>
    setProcessingIds((s) => ({ ...s, [id]: value }));

  // Accessibility: handle Escape to close modal and trap focus
  useEffect(() => {
    if (!showRejectModal) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRejectModal();
      } else if (e.key === "Tab") {
        // Focus trap handling
        const container = modalContainerRef.current;
        if (!container) return;
        const focusable = container.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable.length) {
          e.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRejectModal]);

  useEffect(() => {
    if (showRejectModal) {
      // store previous active element to restore focus later
      prevActiveElementRef.current = document.activeElement as HTMLElement | null;
      // focus the textarea (or fallback to modal container)
      setTimeout(() => {
        if (modalFirstFocusRef.current) {
          modalFirstFocusRef.current.focus();
          modalFirstFocusRef.current.select && modalFirstFocusRef.current.select();
        } else if (modalContainerRef.current) {
          const first = modalContainerRef.current.querySelector<HTMLElement>(
            'button, textarea, input, select, [tabindex]:not([tabindex="-1"])'
          );
          first?.focus();
        }
      }, 0);
    } else {
      // on close, restore focus
      prevActiveElementRef.current?.focus?.();
    }
  }, [showRejectModal]);

  const closeRejectModal = () => {
    setShowRejectModal(false);
    setActiveRejectId(null);
    setRejectReasonInput("");
  };

  // Function: approveBooking(id: string): Promise<void>
  async function approveBooking(id: string): Promise<void> {
    const booking = bookingsRef.current.find((b) => b.id === id);
    if (!booking) {
      setNotice("Booking not found.");
      return;
    }
    if (booking.status === "approved") {
      setNotice("Booking already approved.");
      return;
    }

    const ok = window.confirm(
      `Approve booking for ${booking.customerName} on ${booking.date} at ${booking.time || "?"}?`
    );
    if (!ok) return;

    setProcessing(id, true);
    try {
      // simulate async operation
      await new Promise((res) => setTimeout(res, 600));

      setBookings((prev) =>
        prev.map((b) =>
          b.id === id
            ? {
                ...b,
                status: "approved",
                approvedAt: nowISO(),
                updatedAt: nowISO(),
                paymentProofRequested: false,
              }
            : b
        )
      );
      setNotice(`Booking approved for ${booking.customerName}.`);
      setExpandedId(id);
    } finally {
      setProcessing(id, false);
    }
  }

  // Function: rejectBooking(id: string, reason?: string): Promise<void>
  async function rejectBooking(id: string, reason?: string): Promise<void> {
    const booking = bookingsRef.current.find((b) => b.id === id);
    if (!booking) {
      setNotice("Booking not found.");
      return;
    }
    // If reason provided, proceed; otherwise open modal to collect
    if (!reason) {
      setActiveRejectId(id);
      setRejectReasonInput("");
      setShowRejectModal(true);
      return;
    }

    setProcessing(id, true);
    try {
      await new Promise((res) => setTimeout(res, 500));
      setBookings((prev) =>
        prev.map((b) =>
          b.id === id
            ? {
                ...b,
                status: "rejected",
                rejectionReason: reason,
                updatedAt: nowISO(),
              }
            : b
        )
      );
      setNotice(`Booking rejected${reason ? ` ? ${reason}` : ""}.`);
      closeRejectModal();
      setExpandedId(id);
    } finally {
      setProcessing(id, false);
    }
  }

  // Function: requestPaymentProof(id: string): Promise<void>
  async function requestPaymentProof(id: string): Promise<void> {
    const booking = bookingsRef.current.find((b) => b.id === id);
    if (!booking) {
      setNotice("Booking not found.");
      return;
    }
    if (booking.paymentProofRequested) {
      setNotice("Payment proof already requested.");
      return;
    }

    const ok = window.confirm(
      `Request payment proof from ${booking.customerName} for booking on ${booking.date}?`
    );
    if (!ok) return;

    setProcessing(id, true);
    try {
      await new Promise((res) => setTimeout(res, 500));
      setBookings((prev) =>
        prev.map((b) =>
          b.id === id
            ? {
                ...b,
                paymentProofRequested: true,
                status: "payment_requested",
                updatedAt: nowISO(),
              }
            : b
        )
      );
      setNotice(`Requested payment proof from ${booking.customerName}.`);
      setExpandedId(id);
    } finally {
      setProcessing(id, false);
    }
  }

  const handleRejectSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const id = activeRejectId;
    if (!id) return;
    const reason = rejectReasonInput.trim() || "No reason provided";
    await rejectBooking(id, reason);
  };

  const handleCreateMockBooking = () => {
    const newBooking: Booking = {
      id: generateId(),
      customerName: "New Customer",
      email: undefined,
      phone: undefined,
      date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3)
        .toISOString()
        .slice(0, 10),
      time: "14:00",
      createdAt: nowISO(),
      amount: 100,
      notes: "Quick add.",
      status: "pending",
      paymentProofRequested: false,
      updatedAt: nowISO(),
    };
    setBookings((b) => [newBooking, ...b]);
    setNotice("Mock booking added.");
    setExpandedId(newBooking.id);
  };

  return (
    <div
      style={{
        fontFamily:
          "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
        padding: 16,
        maxWidth: 980,
        margin: "0 auto",
        color: "var(--text, #0f172a)",
      }}
      aria-live="polite"
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>Bookings</h1>
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 13 }}>
            Manage photobooth bookings ? approve, reject, or request payment proof.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleCreateMockBooking}
            style={{
              background: "#111827",
              color: "#fff",
              border: "none",
              padding: "8px 12px",
              borderRadius: 8,
              fontSize: 13,
              cursor: "pointer",
            }}
            aria-label="Add mock booking"
          >
            + Add Booking
          </button>
        </div>
      </header>

      <section
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="search"
            aria-label="Search bookings"
            placeholder="Search by name, email, phone or notes"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: "1 1 220px",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
            }}
          />
          <select
            aria-label="Filter by status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "#fff",
            }}
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="payment_requested">Payment Requested</option>
            <option value="awaiting_payment">Awaiting Payment</option>
          </select>

          <select
            aria-label="Sort bookings"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "#fff",
            }}
          >
            <option value="date">Sort by date</option>
            <option value="created">Sort by newest</option>
            <option value="customer">Sort by customer</option>
          </select>
        </div>
      </section>

      <main>
        {filtered.length === 0 ? (
          <div
            style={{
              padding: 28,
              borderRadius: 12,
              border: "1px dashed #e5e7eb",
              color: "#6b7280",
            }}
          >
            No bookings found.
          </div>
        ) : (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "grid",
              gap: 10,
            }}
          >
            {filtered.map((b) => {
              const busy = !!processingIds[b.id];
              return (
                <li
                  key={b.id}
                  style={{
                    background: "#fff",
                    borderRadius: 12,
                    border: "1px solid #e6edf3",
                    padding: 12,
                    boxShadow: "0 1px 2px rgba(16,24,40,0.03)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <div style={{ flex: "1 1 0" }}>
                      <div
                        style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
                      >
                        <div>
                          <strong style={{ display: "block", fontSize: 15 }}>
                            {b.customerName}
                          </strong>
                          <span style={{ fontSize: 13, color: "#6b7280" }}>
                            {b.email || b.phone || "No contact info"}
                          </span>
                        </div>
                        <div style={{ textAlign: "right", minWidth: 120 }}>
                          <div style={{ fontSize: 13, color: "#6b7280" }}>
                            {b.date} {b.time ? `? ${b.time}` : ""}
                          </div>
                          <div style={{ marginTop: 6 }}>
                            <StatusPill
                              status={b.status}
                              paymentRequested={b.paymentProofRequested}
                            />
                          </div>
                        </div>
                      </div>

                      <div
                        style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}
                      >
                        <button
                          onClick={() => setExpandedId((id) => (id === b.id ? null : b.id))}
                          style={actionButtonStyle}
                          aria-expanded={expandedId === b.id}
                          aria-controls={`details-${b.id}`}
                        >
                          {expandedId === b.id ? "Hide details" : "View details"}
                        </button>

                        <button
                          onClick={() => approveBooking(b.id)}
                          style={actionPrimaryButtonStyle}
                          disabled={busy || b.status === "approved"}
                          aria-disabled={busy || b.status === "approved"}
                          aria-label={`Approve booking ${b.customerName}`}
                        >
                          {processingIds[b.id] && b.status !== "approved"
                            ? "Processing?"
                            : "Approve"}
                        </button>

                        <button
                          onClick={() => rejectBooking(b.id)}
                          style={actionDangerButtonStyle}
                          disabled={busy || b.status === "rejected"}
                          aria-disabled={busy || b.status === "rejected"}
                          aria-label={`Reject booking ${b.customerName}`}
                        >
                          Reject
                        </button>

                        <button
                          onClick={() => requestPaymentProof(b.id)}
                          style={actionButtonStyle}
                          disabled={busy || !!b.paymentProofRequested}
                          aria-disabled={busy || !!b.paymentProofRequested}
                        >
                          {b.paymentProofRequested ? "Payment requested" : "Request payment proof"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {expandedId === b.id && (
                    <div
                      id={`details-${b.id}`}
                      role="region"
                      aria-live="polite"
                      style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed #eef2f7" }}
                    >
                      <div style={{ display: "flex", gap: 12, flexDirection: "column" }}>
                        <div style={{ fontSize: 14, color: "#374151" }}>
                          <strong>Notes:</strong> {b.notes || "?"}
                        </div>
                        <div style={{ fontSize: 13, color: "#6b7280" }}>
                          <strong>Amount:</strong>{" "}
                          {b.amount ? `$${b.amount.toFixed(2)}` : "?"}
                        </div>
                        <div style={{ fontSize: 13, color: "#6b7280" }}>
                          <strong>Created:</strong> {new Date(b.createdAt).toLocaleString()}
                        </div>
                        {b.rejectionReason && (
                          <div style={{ fontSize: 13, color: "#b91c1c" }}>
                            <strong>Rejection reason:</strong> {b.rejectionReason}
                          </div>
                        )}
                        {b.paymentProofRequested && (
                          <div style={{ fontSize: 13, color: "#92400e" }}>
                            <strong>Payment status:</strong> Payment proof requested
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <div aria-live="assertive" role="status" style={{ minHeight: 24, marginTop: 12 }}>
        {notice && (
          <div
            style={{
              display: "inline-block",
              padding: "8px 12px",
              background: "#ecfeff",
              borderRadius: 8,
              border: "1px solid #c7f9fb",
              color: "#064e3b",
              fontSize: 13,
            }}
          >
            {notice}
          </div>
        )}
      </div>

      {/* Reject modal */}
      {showRejectModal && activeRejectId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-modal-title"
          ref={modalContainerRef}
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(2,6,23,0.6)",
            zIndex: 60,
            padding: 16,
          }}
          onClick={(e) => {
            // close when clicking on backdrop (but not when clicking inside content)
            if (e.target === e.currentTarget) {
              closeRejectModal();
            }
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              background: "#fff",
              borderRadius: 12,
              padding: 16,
              boxShadow: "0 10px 30px rgba(2,6,23,0.3)",
            }}
          >
            <h2 id="reject-modal-title" style={{ margin: 0, fontSize: 18 }}>
              Reject booking
            </h2>
            <p style={{ marginTop: 8, color: "#6b7280", fontSize: 13 }}>
              Provide a reason to notify the customer (optional, will be saved).
            </p>

            <form
              onSubmit={handleRejectSubmit}
              style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}
            >
              <textarea
                ref={modalFirstFocusRef}
                value={rejectReasonInput}
                onChange={(e) => setRejectReasonInput(e.target.value)}
                placeholder="Reason for rejection (e.g. date unavailable)"
                style={{
                  minHeight: 100,
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid #e6eef6",
                }}
                aria-label="Rejection reason"
              />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => {
                    closeRejectModal();
                  }}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "transparent",
                    border: "1px solid #e5e7eb",
                    color: "#374151",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: "#b91c1c",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  Confirm reject
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* Small presentational helpers */

function StatusPill({ status, paymentRequested }: { status: BookingStatus; paymentRequested?: boolean }) {
  const label =
    status === "pending"
      ? "Pending"
      : status === "approved"
      ? "Approved"
      : status === "rejected"
      ? "Rejected"
      : status === "payment_requested"
      ? "Payment requested"
      : status === "awaiting_payment"
      ? "Awaiting payment"
      : "Unknown";

  const bg =
    status === "approved"
      ? "#ecfeff"
      : status === "rejected"
      ? "#fff1f2"
      : status === "pending"
      ? "#fff7ed"
      : "#fffbeb";

  const color =
    status === "approved" ? "#065f46" : status === "rejected" ? "#991b1b" : "#92400e";

  return (
    <span
      style={{
        display: "inline-block",
        padding: "6px 8px",
        borderRadius: 999,
        background: bg,
        color,
        fontSize: 12,
        border: "1px solid rgba(0,0,0,0.03)",
      }}
      aria-hidden
    >
      {label}
      {paymentRequested ? " ? proof requested" : ""}
    </span>
  );
}

const actionButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #e5e7eb",
  padding: "8px 10px",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  color: "#374151",
};

const actionPrimaryButtonStyle: React.CSSProperties = {
  background: "#10b981",
  color: "#fff",
  border: "none",
  padding: "8px 12px",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
};

const actionDangerButtonStyle: React.CSSProperties = {
  background: "transparent",
  color: "#b91c1c",
  border: "1px solid rgba(185,28,28,0.12)",
  padding: "8px 10px",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
};