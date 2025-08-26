const STORAGE_KEY = "pb_bookings_v2";
const SESSION_KEY = "pb_session_v2";

/* Utility helpers */
const uid = (prefix = "") =>
  prefix + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

const readBookingsFromStorage = (): Booking[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Booking[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
};

const writeBookingsToStorage = (bookings: Booking[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
  } catch {
    // ignore storage errors for now
  }
};

const writeSession = (data: { email?: string | null; reference?: string | null } | null) => {
  try {
    if (!data) localStorage.removeItem(SESSION_KEY);
    else localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch {}
};

const readSession = (): { email?: string | null; reference?: string | null } | null => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/* Seed demo bookings if none exist so dashboard is usable */
const ensureSeedBookings = () => {
  const bookings = readBookingsFromStorage();
  if (bookings.length > 0) return;
  const seed: Booking[] = [
    {
      id: uid("b_"),
      reference: "REF" + Math.random().toString(36).slice(2, 7).toUpperCase(),
      name: "Alice Rivera",
      email: "alice@example.com",
      date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString().slice(0, 10),
      time: "15:00",
      totalAmount: 250.0,
      status: "pending_payment",
      paymentProof: null,
      notes: "Birthday event ? 4 hours",
    },
    {
      id: uid("b_"),
      reference: "REF" + Math.random().toString(36).slice(2, 7).toUpperCase(),
      name: "Bob Chen",
      email: "bob@example.com",
      date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString().slice(0, 10),
      time: "19:00",
      totalAmount: 350.0,
      status: "confirmed",
      paymentProof: {
        fileName: "receipt.jpg",
        mimeType: "image/jpeg",
        dataUrl: "",
        uploadedAt: new Date().toISOString(),
      },
      notes: "Corporate event ? 6 hours",
    },
  ];
  writeBookingsToStorage(seed);
};

/* File validation */
const isValidFileType = (file: File) => {
  const allowed = ["image/", "application/pdf"];
  return allowed.some((p) => file.type.startsWith(p));
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

/* Core exported functions per pseudocode */
export async function loginByEmail(email: string): Promise<boolean> {
  // validate
  const normalized = (email || "").trim().toLowerCase();
  if (!normalized) return false;
  const bookings = readBookingsFromStorage();
  const found = bookings.some((b) => b.email.toLowerCase() === normalized);
  if (!found) return false;
  writeSession({ email: normalized, reference: null });
  return true;
}

export async function loginByReference(ref: string): Promise<boolean> {
  const r = (ref || "").trim();
  if (!r) return false;
  const bookings = readBookingsFromStorage();
  const found = bookings.some((b) => b.reference.toLowerCase() === r.toLowerCase());
  if (!found) return false;
  writeSession({ email: null, reference: r });
  return true;
}

export async function reuploadPaymentProof(bookingId: string, file: File): Promise<void> {
  if (!bookingId) throw new Error("Missing booking id");
  if (!file) throw new Error("Missing file");
  if (!isValidFileType(file)) throw new Error("Invalid file type");
  if (file.size > MAX_FILE_SIZE) throw new Error("File too large");

  // read file to data URL
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed reading file"));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") resolve(result);
      else reject(new Error("Unsupported file result"));
    };
    reader.readAsDataURL(file);
  });

  // update booking in storage
  const bookings = readBookingsFromStorage();
  const idx = bookings.findIndex((b) => b.id === bookingId);
  if (idx === -1) throw new Error("Booking not found");
  bookings[idx] = {
    ...bookings[idx],
    paymentProof: {
      fileName: file.name,
      mimeType: file.type,
      dataUrl,
      uploadedAt: new Date().toISOString(),
    },
    status: "payment_submitted",
  };
  writeBookingsToStorage(bookings);
  // small artificial delay to emulate upload
  await new Promise((res) => setTimeout(res, 400));
}

/* Main component */
export default function CustomerDashboard(): JSX.Element {
  const [initialized, setInitialized] = useState(false);
  const [session, setSession] = useState<{ email?: string | null; reference?: string | null } | null>(
    null
  );
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filtered, setFiltered] = useState<Booking[]>([]);
  const [mode, setMode] = useState<"email" | "reference">("email");
  const [emailInput, setEmailInput] = useState("");
  const [refInput, setRefInput] = useState("");
  const [status, setStatus] = useState<{ message: string; type: "success" | "error" | "info" } | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Seed bookings once (only in browser) on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        ensureSeedBookings();
      } catch {
        // ignore seed errors
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const s = readSession();
    setSession(s);
    const bs = readBookingsFromStorage();
    setBookings(bs);
    setInitialized(true);
  }, []);

  useEffect(() => {
    if (!initialized) return;
    if (!session) {
      setFiltered([]);
      return;
    }
    const bs = readBookingsFromStorage();
    if (session.email) {
      setFiltered(bs.filter((b) => b.email.toLowerCase() === session.email!.toLowerCase()));
    } else if (session.reference) {
      setFiltered(bs.filter((b) => b.reference.toLowerCase() === session.reference!.toLowerCase()));
    } else {
      setFiltered([]);
    }
    setBookings(bs);
  }, [session, initialized]);

  const handleLoginEmail = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setStatus(null);
    const email = emailInput.trim().toLowerCase();
    if (!email) {
      setStatus({ message: "Please enter an email address.", type: "error" });
      return;
    }
    setLoading(true);
    try {
      const ok = await loginByEmail(email);
      if (!ok) {
        setStatus({ message: "No bookings found for that email.", type: "error" });
      } else {
        setSession({ email, reference: null });
        setStatus({ message: "Logged in by email.", type: "success" });
      }
    } catch (err) {
      setStatus({ message: (err as Error).message || "Login failed.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleLoginReference = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setStatus(null);
    const ref = refInput.trim();
    if (!ref) {
      setStatus({ message: "Please enter a booking reference.", type: "error" });
      return;
    }
    setLoading(true);
    try {
      const ok = await loginByReference(ref);
      if (!ok) {
        setStatus({ message: "Booking reference not found.", type: "error" });
      } else {
        setSession({ email: null, reference: ref });
        setStatus({ message: "Logged in by reference.", type: "success" });
      }
    } catch (err) {
      setStatus({ message: (err as Error).message || "Login failed.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    writeSession(null);
    setSession(null);
    setEmailInput("");
    setRefInput("");
    setStatus({ message: "Logged out.", type: "info" });
  };

  const triggerFileSelect = (bookingId: string) => {
    const ref = fileInputRefs.current[bookingId];
    if (ref) ref.click();
  };

  const handleFileChange = async (bookingId: string, f?: FileList | null) => {
    setStatus(null);
    const file = f?.[0] ?? null;
    if (!file) return;
    setUploadingId(bookingId);
    setLoading(true);
    try {
      await reuploadPaymentProof(bookingId, file);
      const updated = readBookingsFromStorage();
      setBookings(updated);
      if (session?.email) {
        setFiltered(updated.filter((b) => b.email.toLowerCase() === session.email!.toLowerCase()));
      } else if (session?.reference) {
        setFiltered(
          updated.filter((b) => b.reference.toLowerCase() === session.reference!.toLowerCase())
        );
      } else {
        setFiltered(updated);
      }
      setStatus({ message: "Payment proof uploaded successfully.", type: "success" });
    } catch (err) {
      setStatus({ message: (err as Error).message || "Upload failed.", type: "error" });
    } finally {
      setLoading(false);
      setUploadingId(null);
      const input = fileInputRefs.current[bookingId];
      if (input) {
        try {
          input.value = "";
        } catch {
          // ignore
        }
      }
    }
  };

  const formatCurrency = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });

  // small accessible styles inline (mobile-first)
  const containerStyle: React.CSSProperties = {
    maxWidth: 900,
    margin: "0 auto",
    padding: 16,
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
    color: "#0f172a",
  };

  const cardStyle: React.CSSProperties = {
    border: "1px solid #e6edf3",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    background: "#fff",
    boxShadow: "0 1px 2px rgba(16,24,40,0.03)",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    marginTop: 8,
    marginBottom: 8,
    fontSize: 16,
  };

  return (
    <div style={containerStyle}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Customer Dashboard</h1>
        <p style={{ margin: "6px 0 0 0", color: "#475569" }}>
          Manage your photobooth bookings and upload payment proof.
        </p>
      </header>

      {!session && (
        <section style={cardStyle} aria-labelledby="login-heading">
          <h2 id="login-heading" style={{ fontSize: 16, margin: 0 }}>
            Sign in
          </h2>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              onClick={() => setMode("email")}
              aria-pressed={mode === "email"}
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 8,
                border: mode === "email" ? "2px solid #0ea5a4" : "1px solid #cbd5e1",
                background: mode === "email" ? "#ecfeff" : "#fff",
              }}
            >
              By email
            </button>
            <button
              onClick={() => setMode("reference")}
              aria-pressed={mode === "reference"}
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 8,
                border: mode === "reference" ? "2px solid #0ea5a4" : "1px solid #cbd5e1",
                background: mode === "reference" ? "#ecfeff" : "#fff",
              }}
            >
              By booking ref
            </button>
          </div>

          {mode === "email" ? (
            <form onSubmit={handleLoginEmail} style={{ marginTop: 12 }}>
              <label htmlFor="email" style={{ fontSize: 14 }}>
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="you@example.com"
                style={inputStyle}
                autoComplete="email"
                required
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: "#0ea5a4",
                    color: "#fff",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {loading ? "Checking?" : "Sign in"}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleLoginReference} style={{ marginTop: 12 }}>
              <label htmlFor="reference" style={{ fontSize: 14 }}>
                Booking reference
              </label>
              <input
                id="reference"
                name="reference"
                type="text"
                value={refInput}
                onChange={(e) => setRefInput(e.target.value)}
                placeholder="e.g. REFABCDE"
                style={inputStyle}
                required
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: "#0ea5a4",
                    color: "#fff",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {loading ? "Checking?" : "Find booking"}
                </button>
              </div>
            </form>
          )}

          {status && (
            <div
              role="status"
              aria-live="polite"
              style={{
                marginTop: 10,
                color:
                  status.type === "error" ? "#b91c1c" : status.type === "success" ? "#0f5132" : "#0f5132",
              }}
            >
              {status.message}
            </div>
          )}
        </section>
      )}

      {session && (
        <>
          <section style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong>
                Signed in{" "}
                {session.email ? `as ${session.email}` : session.reference ? `with ${session.reference}` : ""}
              </strong>
              <div style={{ color: "#475569", fontSize: 14 }}>
                {filtered.length} booking{filtered.length !== 1 ? "s" : ""}
              </div>
            </div>
            <div>
              <button
                onClick={handleLogout}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                }}
              >
                Sign out
              </button>
            </div>
          </section>

          <section style={{ marginTop: 12 }}>
            {filtered.length === 0 && (
              <div style={cardStyle}>
                <p style={{ margin: 0 }}>No bookings found for this account.</p>
              </div>
            )}

            {filtered.map((b) => (
              <div key={b.id} style={cardStyle} aria-labelledby={`booking-${b.reference}`}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <h3 id={`booking-${b.reference}`} style={{ margin: "0 0 4px 0", fontSize: 16 }}>
                      {b.name} ? {b.reference}
                    </h3>
                    <div style={{ color: "#475569", fontSize: 14 }}>
                      {b.date} at {b.time}
                    </div>
                    <div style={{ marginTop: 8, fontWeight: 600 }}>{formatCurrency(b.totalAmount)}</div>
                  </div>

                  <div style={{ textAlign: "right", minWidth: 120 }}>
                    <div
                      style={{
                        display: "inline-block",
                        padding: "6px 8px",
                        background:
                          b.status === "confirmed"
                            ? "#ecfccb"
                            : b.status === "payment_submitted"
                            ? "#eef2ff"
                            : "#fff7ed",
                        borderRadius: 8,
                        border: "1px solid #e6edf3",
                        fontSize: 13,
                      }}
                    >
                      {b.status.replace(/_/g, " ")}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <button
                        onClick={() => triggerFileSelect(b.id)}
                        disabled={loading && uploadingId !== b.id}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "none",
                          background: "#2563eb",
                          color: "#fff",
                          marginTop: 8,
                          cursor: "pointer",
                        }}
                      >
                        {uploadingId === b.id ? "Uploading?" : "Reupload payment proof"}
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 12, fontSize: 14, color: "#334155" }}>
                  {b.notes && <div style={{ marginBottom: 8 }}>{b.notes}</div>}

                  <div>
                    <strong>Payment proof:</strong>{" "}
                    {b.paymentProof ? (
                      <span>
                        {b.paymentProof.fileName} ?{" "}
                        <time dateTime={b.paymentProof.uploadedAt}>
                          {new Date(b.paymentProof.uploadedAt).toLocaleString()}
                        </time>
                        <div style={{ marginTop: 8 }}>
                          {b.paymentProof.mimeType.startsWith("image/") && b.paymentProof.dataUrl ? (
                            <img
                              src={b.paymentProof.dataUrl}
                              alt={`Payment proof for ${b.reference}`}
                              style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid #e6edf3" }}
                            />
                          ) : b.paymentProof.dataUrl ? (
                            <a
                              href={b.paymentProof.dataUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: "#2563eb" }}
                            >
                              View uploaded file
                            </a>
                          ) : (
                            <span style={{ color: "#64748b" }}>No preview available</span>
                          )}
                        </div>
                      </span>
                    ) : (
                      <span style={{ color: "#64748b" }}>No payment proof uploaded</span>
                    )}
                  </div>
                </div>

                <input
                  ref={(el) => (fileInputRefs.current[b.id] = el)}
                  type="file"
                  accept="image/*,application/pdf"
                  style={{ display: "none" }}
                  onChange={(e) => handleFileChange(b.id, e.target.files)}
                />
              </div>
            ))}
          </section>

          <footer style={{ marginTop: 18, color: "#94a3b8", fontSize: 13 }}>
            <div>All data is stored locally in your browser for this demo.</div>
            {status && (
              <div
                role="status"
                aria-live="polite"
                style={{
                  marginTop: 8,
                  color:
                    status.type === "error"
                      ? "#b91c1c"
                      : status.type === "success"
                      ? "#0f5132"
                      : "#475569",
                  fontSize: 13,
                }}
              >
                {status.message}
              </div>
            )}
          </footer>
        </>
      )}
    </div>
  );
}