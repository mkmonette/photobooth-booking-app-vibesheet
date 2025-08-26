const DRAFT_KEY = "photoboothDraft";
const BOOKINGS_KEY = "photoboothBookings";

function safeParseDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Draft;
  } catch {
    return null;
  }
}

interface Totals {
  subtotal: number; // sum of package + hours + addOns + extras (before discount)
  discountTotal: number; // discount amount applied (always >= 0)
  taxedBase: number; // subtotal - discountTotal (>= 0)
  taxTotal: number; // taxes applied (>= 0)
  depositAmount: number; // deposit amount (>= 0)
  totalDue: number; // taxedBase + taxTotal (what's due for the booking)
  grandTotal: number; // totalDue + depositAmount (if deposit is tracked separately but included in overall total)
}

/**
 * Computes a canonical breakdown of totals for a draft.
 * - Deposit percentage is applied to the taxedBase (post-discount) to keep calculations consistent.
 * - Returns zeros for null/invalid drafts.
 */
export function calculateTotals(draft: Draft | null | undefined): Totals {
  if (!draft) {
    return {
      subtotal: 0,
      discountTotal: 0,
      taxedBase: 0,
      taxTotal: 0,
      depositAmount: 0,
      totalDue: 0,
      grandTotal: 0,
    };
  }

  let subtotal = 0;

  // Package base price
  if (draft.package && typeof draft.package.price === "number") {
    subtotal += draft.package.price;
  }

  // If hours beyond included or hourlyRate is provided
  if (draft.hours && draft.hours > 0) {
    const included = draft.package?.hoursIncluded ?? 0;
    const hourlyRate = draft.hourlyRate ?? 0;
    const billedHours = Math.max(0, draft.hours - included);
    subtotal += billedHours * hourlyRate;
  }

  // Add-ons
  if (Array.isArray(draft.addOns)) {
    for (const add of draft.addOns) {
      const qty = typeof add.quantity === "number" ? Math.max(1, add.quantity) : 1;
      subtotal += (Number(add.price) || 0) * qty;
    }
  }

  // Extras (one-off things)
  if (Array.isArray(draft.extras)) {
    for (const ex of draft.extras) {
      subtotal += Number(ex.price) || 0;
    }
  }

  // Apply discount (before tax)
  let discountTotal = 0;
  if (draft.discount) {
    const { type, amount } = draft.discount;
    if (type === "fixed") {
      discountTotal = Math.max(0, Number(amount) || 0);
      // Do not let discount exceed subtotal
      discountTotal = Math.min(discountTotal, subtotal);
    } else {
      // percent
      const pct = Math.max(0, Math.min(100, Number(amount) || 0));
      discountTotal = (pct / 100) * subtotal;
    }
  }

  const taxedBase = Math.max(0, subtotal - discountTotal);

  // Taxes
  let taxTotal = 0;
  if (typeof draft.taxPercent === "number" && draft.taxPercent > 0) {
    const pct = Math.max(0, Math.min(100, draft.taxPercent));
    taxTotal = (pct / 100) * taxedBase;
  }

  // Deposit
  let depositAmount = 0;
  if (draft.deposit) {
    const { type, amount } = draft.deposit;
    if (type === "fixed") {
      depositAmount = Math.max(0, Number(amount) || 0);
    } else {
      const pct = Math.max(0, Math.min(100, Number(amount) || 0));
      // NOTE: deposit percent is calculated over the taxedBase (post-discount) to be consistent
      depositAmount = (pct / 100) * taxedBase;
    }
  }

  const totalDue = Math.max(0, taxedBase + taxTotal); // what the booking costs (excluding deposit tracking)
  const grandTotal = Math.max(0, totalDue + depositAmount); // if deposit should be included in an overall total view

  return {
    subtotal: Number(subtotal.toFixed(2)),
    discountTotal: Number(discountTotal.toFixed(2)),
    taxedBase: Number(taxedBase.toFixed(2)),
    taxTotal: Number(taxTotal.toFixed(2)),
    depositAmount: Number(depositAmount.toFixed(2)),
    totalDue: Number(totalDue.toFixed(2)),
    grandTotal: Number(grandTotal.toFixed(2)),
  };
}

/**
 * Backwards-compatible helper that returns a single total number (grand total).
 */
export function calculateTotal(draft: Draft | null | undefined): number {
  return calculateTotals(draft).grandTotal;
}

export async function confirmBooking(draft: Draft): Promise<{ id: string }> {
  // Basic validation
  if (!draft) {
    return Promise.reject(new Error("No booking draft to confirm."));
  }
  const customer = draft.customer;
  const event = draft.event;
  if (!customer || !customer.name || !customer.email) {
    return Promise.reject(new Error("Customer name and email are required."));
  }
  if (!event || !event.date) {
    return Promise.reject(new Error("Event date is required."));
  }

  const totals = calculateTotals(draft);
  const total = totals.grandTotal;
  if (Number.isNaN(total) || total < 0) {
    return Promise.reject(new Error("Invalid total calculated."));
  }

  // Simulate async save (could be replaced with real API)
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const booking: Booking = {
    id,
    createdAt: new Date().toISOString(),
    draft,
    total,
    status: "confirmed",
  };

  return new Promise<{ id: string }>((resolve, reject) => {
    try {
      // small delay to simulate network
      setTimeout(() => {
        const raw = localStorage.getItem(BOOKINGS_KEY);
        let bookings: Booking[] = [];
        try {
          bookings = raw ? (JSON.parse(raw) as Booking[]) : [];
        } catch {
          bookings = [];
        }
        bookings.push(booking);
        localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings));
        // remove draft after confirming
        localStorage.removeItem(DRAFT_KEY);
        resolve({ id });
      }, 600);
    } catch (err) {
      reject(new Error("Failed to save booking."));
    }
  });
}

/**
 * Format currency. Attempts to derive default currency from stored draft if available,
 * otherwise falls back to USD. Accepts an explicit currency argument.
 */
function currencyFormat(amount: number, currency?: string, locale?: string) {
  const defaultCurrency = currency ?? safeParseDraft()?.currency ?? "USD";
  try {
    return new Intl.NumberFormat(locale ?? undefined, {
      style: "currency",
      currency: defaultCurrency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // fallback
    return `${defaultCurrency} ${amount.toFixed(2)}`;
  }
}

export default function SummaryPage(): JSX.Element {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Draft | null>(() => safeParseDraft());
  const [totals, setTotals] = useState<Totals>(() => calculateTotals(safeParseDraft()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  useEffect(() => {
    const stored = safeParseDraft();
    setDraft(stored);
  }, []);

  useEffect(() => {
    setTotals(calculateTotals(draft));
  }, [draft]);

  const handleEdit = () => {
    try {
      navigate("/booking");
    } catch {
      navigate("/");
    }
  };

  const handleConfirm = async () => {
    setError(null);
    if (!draft) {
      setError("No booking to confirm.");
      return;
    }

    setLoading(true);
    try {
      const result = await confirmBooking(draft);
      setSuccessId(result.id);
      setDraft(null);
      setTotals(calculateTotals(null));
    } catch (err: any) {
      setError(err?.message || "Failed to confirm booking.");
    } finally {
      setLoading(false);
    }
  };

  const packageSection = useMemo(() => {
    if (!draft?.package) return null;
    return (
      <div className="summary-section" aria-labelledby="pkg-label">
        <div id="pkg-label" className="summary-section-title">
          Selected Package
        </div>
        <div className="summary-row">
          <div>
            <strong>{draft.package.name}</strong>
            {typeof draft.hours === "number" && (
              <div className="muted">Hours: {draft.hours}</div>
            )}
          </div>
          <div>{currencyFormat(draft.package.price, draft?.currency)}</div>
        </div>
      </div>
    );
  }, [draft]);

  const addOnsSection = useMemo(() => {
    if (!draft?.addOns || draft.addOns.length === 0) return null;
    return (
      <div className="summary-section" aria-labelledby="addons-label">
        <div id="addons-label" className="summary-section-title">
          Add?Ons
        </div>
        {draft.addOns.map((a) => (
          <div key={a.id} className="summary-row">
            <div>
              {a.name}
              {typeof a.quantity === "number" && a.quantity > 1 ? ` ?${a.quantity}` : null}
            </div>
            <div>{currencyFormat((a.price || 0) * (a.quantity ?? 1), draft?.currency)}</div>
          </div>
        ))}
      </div>
    );
  }, [draft]);

  const extrasSection = useMemo(() => {
    if (!draft?.extras || draft.extras.length === 0) return null;
    return (
      <div className="summary-section" aria-labelledby="extras-label">
        <div id="extras-label" className="summary-section-title">
          Extras
        </div>
        {draft.extras.map((e) => (
          <div key={e.id} className="summary-row">
            <div>{e.name}</div>
            <div>{currencyFormat(e.price, draft?.currency)}</div>
          </div>
        ))}
      </div>
    );
  }, [draft]);

  const discountRow = useMemo(() => {
    if (!draft?.discount) return null;
    const { type, amount } = draft.discount;
    const label = type === "fixed" ? "Discount" : `Discount (${amount}%)`;
    const discountAmount = totals.discountTotal;
    return (
      <div className="summary-row">
        <div>{label}</div>
        <div>-{currencyFormat(discountAmount, draft?.currency)}</div>
      </div>
    );
  }, [draft, totals]);

  const taxRow = useMemo(() => {
    if (!draft || typeof draft.taxPercent !== "number" || draft.taxPercent <= 0) return null;
    const taxAmount = totals.taxTotal;
    return (
      <div className="summary-row">
        <div>Tax ({draft.taxPercent}%)</div>
        <div>{currencyFormat(taxAmount, draft?.currency)}</div>
      </div>
    );
  }, [draft, totals]);

  const depositRow = useMemo(() => {
    if (!draft?.deposit) return null;
    // deposit amount is computed over taxedBase (post-discount) to match calculateTotals
    const depositAmount = totals.depositAmount;
    return (
      <div className="summary-row">
        <div>Deposit</div>
        <div>{currencyFormat(depositAmount, draft?.currency)}</div>
      </div>
    );
  }, [draft, totals]);

  if (!draft) {
    return (
      <main className="page summary-page">
        <header className="page-header">
          <h1>Booking Summary</h1>
        </header>
        <section className="empty-state">
          <p>No booking found. Start a new booking to see the summary.</p>
          <div className="actions">
            <button type="button" className="btn-primary" onClick={() => navigate("/")}>
              Start Booking
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page summary-page" aria-live="polite">
      <header className="page-header">
        <h1>Booking Summary</h1>
        <p className="muted">Review your selections and confirm your booking.</p>
      </header>

      <section className="summary">
        {packageSection}

        {addOnsSection}

        {extrasSection}

        <div className="summary-section" aria-labelledby="customer-label">
          <div id="customer-label" className="summary-section-title">
            Customer
          </div>
          <div className="summary-row">
            <div>{draft.customer?.name ?? "?"}</div>
            <div>{draft.customer?.email ?? "?"}</div>
          </div>
          {draft.customer?.phone ? (
            <div className="summary-row">
              <div>Phone</div>
              <div>{draft.customer?.phone}</div>
            </div>
          ) : null}
        </div>

        <div className="summary-section" aria-labelledby="event-label">
          <div id="event-label" className="summary-section-title">
            Event
          </div>
          <div className="summary-row">
            <div>Date</div>
            <div>{draft.event?.date ?? "?"}</div>
          </div>
          <div className="summary-row">
            <div>Time</div>
            <div>{draft.event?.time ?? "?"}</div>
          </div>
          {draft.event?.venue ? (
            <div className="summary-row">
              <div>Venue</div>
              <div>{draft.event?.venue}</div>
            </div>
          ) : null}
        </div>

        <div className="summary-totals" aria-hidden={false}>
          <div className="summary-row total-header">
            <div>Summary</div>
            <div></div>
          </div>

          {/* Subtotal computed and displayed consistently from totals */}
          <div className="summary-row">
            <div>Subtotal</div>
            <div>{currencyFormat(totals.subtotal, draft?.currency)}</div>
          </div>

          {discountRow}

          {taxRow}

          {depositRow}

          <div className="summary-row total">
            <div>
              <strong>Total</strong>
            </div>
            <div>
              <strong>{currencyFormat(totals.grandTotal, draft?.currency)}</strong>
            </div>
          </div>
        </div>

        {error ? (
          <div role="alert" className="notification error">
            {error}
          </div>
        ) : null}

        {successId ? (
          <div role="status" className="notification success">
            Booking confirmed ? ID: <strong>{successId}</strong>
          </div>
        ) : null}

        <div className="actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={handleEdit}
            disabled={loading}
            aria-disabled={loading}
          >
            Edit
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleConfirm}
            disabled={loading}
            aria-disabled={loading}
            aria-busy={loading}
          >
            {loading ? "Confirming..." : "Confirm Booking"}
          </button>
        </div>
      </section>
    </main>
  );
}