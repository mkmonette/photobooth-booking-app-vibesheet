const STORAGE_KEYS = {
  THEME: "photobooth:theme",
  BOOKINGS: "photobooth:bookings",
  LAST_ERROR: "photobooth:lastError",
};

function safeGetLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeSetLocal<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

/* ============================
   Theme Context & Hook
   ============================ */

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (t: Theme) => void;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within AppProviders");
  }
  return ctx;
}

/* ============================
   Error Boundary & Setup
   ============================ */

type ErrorState = { error: Error | null; info?: string | null };

class ErrorBoundary extends React.Component<{ children: ReactNode }, ErrorState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error, info: null };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    try {
      const payload = {
        message: error.message,
        stack: error.stack,
        componentStack: info.componentStack,
        time: new Date().toISOString(),
      };
      safeSetLocal(STORAGE_KEYS.LAST_ERROR, payload);
      // also log to console
      // eslint-disable-next-line no-console
      console.error("Unhandled React error captured:", payload);
    } catch {
      // swallow
    }
  }

  reset = () => this.setState({ error: null, info: null });

  copyError = async () => {
    const e = this.state.error;
    if (!e) return;
    const text = `Error: ${e.message}\nStack: ${e.stack}\nTime: ${new Date().toISOString()}`;
    try {
      await navigator.clipboard.writeText(text);
      // eslint-disable-next-line no-alert
      alert("Error copied to clipboard.");
    } catch {
      // fallback
      // eslint-disable-next-line no-alert
      alert(text);
    }
  };

  render() {
    if (this.state.error) {
      const err = this.state.error;
      return (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            boxSizing: "border-box",
            background: "#111",
            color: "#fff",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
          }}
        >
          <div
            style={{
              maxWidth: 760,
              width: "100%",
              background: "linear-gradient(180deg,#1a1a1a,#121212)",
              borderRadius: 12,
              padding: 24,
              boxShadow: "0 6px 30px rgba(0,0,0,0.6)",
              border: "1px solid rgba(255,255,255,0.03)",
            }}
          >
            <h1 style={{ margin: 0, fontSize: 20 }}>Something went wrong</h1>
            <p style={{ color: "#ccc" }}>
              An unexpected error occurred. You can try reloading the application or copy the
              technical details to share with support.
            </p>

            <details
              style={{
                whiteSpace: "pre-wrap",
                background: "rgba(255,255,255,0.02)",
                padding: 12,
                borderRadius: 8,
                marginTop: 12,
                color: "#ddd",
                maxHeight: 200,
                overflow: "auto",
                fontSize: 13,
                lineHeight: "1.4",
              }}
            >
              <summary style={{ cursor: "pointer", color: "#fff" }}>View error details</summary>
              <div style={{ marginTop: 8 }}>
                <strong>{err.message}</strong>
                <pre
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    color: "#ddd",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {err.stack}
                </pre>
              </div>
            </details>

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button
                onClick={() => window.location.reload()}
                style={buttonStyle}
                aria-label="Reload app"
              >
                Reload
              </button>
              <button onClick={this.reset} style={buttonStyle} aria-label="Dismiss error">
                Dismiss
              </button>
              <button onClick={this.copyError} style={secondaryButtonStyle} aria-label="Copy error">
                Copy details
              </button>
            </div>
            <p style={{ color: "rgba(255,255,255,0.5)", marginTop: 12, fontSize: 13 }}>
              The app saved technical details to localStorage for diagnostics.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children as JSX.Element;
  }
}

/**
 * Attach global error handlers for uncaught errors and unhandled promise rejections.
 * This writes last error to localStorage for inspection and logs to console.
 */
function setupErrorBoundary(): void {
  if (typeof window === "undefined") return;
  // Avoid attaching multiple times
  const marker = "__photobooth_global_error_handlers_attached__";
  // @ts-ignore
  if ((window as any)[marker]) return;
  // @ts-ignore
  (window as any)[marker] = true;

  window.addEventListener("error", (ev) => {
    try {
      const err = ev.error || {
        message: ev.message || "Unknown error",
        filename: ev.filename,
        lineno: ev.lineno,
        colno: ev.colno,
      };
      const payload = {
        type: "error",
        message: err.message,
        stack: err.stack,
        extra: {
          filename: ev.filename,
          lineno: ev.lineno,
          colno: ev.colno,
        },
        time: new Date().toISOString(),
      };
      safeSetLocal(STORAGE_KEYS.LAST_ERROR, payload);
      // eslint-disable-next-line no-console
      console.error("Global error captured:", payload);
    } catch {
      // ignore
    }
  });

  window.addEventListener("unhandledrejection", (ev) => {
    try {
      const reason = (ev as PromiseRejectionEvent).reason;
      const payload = {
        type: "unhandledrejection",
        message: (reason && reason.message) || String(reason) || "Unknown rejection",
        stack: reason && reason.stack,
        time: new Date().toISOString(),
      };
      safeSetLocal(STORAGE_KEYS.LAST_ERROR, payload);
      // eslint-disable-next-line no-console
      console.error("Unhandled promise rejection captured:", payload);
    } catch {
      // ignore
    }
  });
}

/* ============================
   Simple UI Helpers
   ============================ */

const buttonStyle: React.CSSProperties = {
  background: "linear-gradient(180deg,#2b6cb0,#2c5282)",
  color: "#fff",
  border: "none",
  padding: "8px 12px",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 14,
};

const secondaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "transparent",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#fff",
};

/* ============================
   AppProviders
   ============================ */

function AppProviders({ children }: { children: ReactNode }): JSX.Element {
  const [theme, setThemeState] = useState<Theme>(() => {
    return (safeGetLocal<Theme>(STORAGE_KEYS.THEME, "system") as Theme) || "system";
  });

  useEffect(() => {
    setupErrorBoundary();
  }, []);

  useEffect(() => {
    safeSetLocal(STORAGE_KEYS.THEME, theme);
  }, [theme]);

  const prefersDark = usePrefersDark();

  const resolvedTheme = useMemo<"light" | "dark">(() => {
    if (theme === "system") return prefersDark ? "dark" : "light";
    return theme === "dark" ? "dark" : "light";
  }, [theme, prefersDark]);

  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === "dark") {
      root.classList.add("theme-dark");
      root.classList.remove("theme-light");
    } else {
      root.classList.add("theme-light");
      root.classList.remove("theme-dark");
    }
    root.setAttribute("data-theme", resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggle = useCallback(() => {
    setThemeState((prev) => {
      if (prev === "dark") return "light";
      if (prev === "light") return "system";
      return "dark";
    });
  }, []);

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      toggle,
    }),
    [theme, resolvedTheme, setTheme, toggle]
  );

  return (
    <ThemeContext.Provider value={value}>
      <BrowserRouter>
        <ErrorBoundary>{children}</ErrorBoundary>
      </BrowserRouter>
    </ThemeContext.Provider>
  );
}

function usePrefersDark(): boolean {
  const [prefers, setPrefers] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches : false
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (ev: MediaQueryListEvent) => setPrefers(ev.matches);
    try {
      // some browsers support addEventListener for MediaQueryList
      if (mq.addEventListener) mq.addEventListener("change", handler);
      else mq.addListener(handler);
    } catch {
      // fallback
    }
    return () => {
      try {
        if (mq.removeEventListener) mq.removeEventListener("change", handler);
        else mq.removeListener(handler);
      } catch {
        // ignore
      }
    };
  }, []);

  return prefers;
}

/* ============================
   Small Demo Pages & Components
   ============================ */

function Header() {
  const { resolvedTheme, toggle } = useTheme();
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "12px 16px",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
        background:
          resolvedTheme === "dark" ? "linear-gradient(180deg,#0b1220,#07101b)" : "linear-gradient(180deg,#fff,#fafafa)",
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Link to="/" aria-label="Photobooth home" style={{ textDecoration: "none", color: "inherit" }}>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
            <strong style={{ fontSize: 16 }}>Photobooth</strong>
            <small style={{ opacity: 0.6 }}>Booking App</small>
          </div>
        </Link>
        <nav aria-label="Main">
          <NavLink
            to="/"
            end
            style={({ isActive }) => ({
              marginRight: 12,
              textDecoration: "none",
              color: isActive ? "#2b6cb0" : "inherit",
            })}
          >
            Home
          </NavLink>
          <NavLink
            to="/booking"
            style={({ isActive }) => ({
              textDecoration: "none",
              color: isActive ? "#2b6cb0" : "inherit",
            })}
          >
            Booking
          </NavLink>
        </nav>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 13, opacity: 0.8 }}>{resolvedTheme}</span>
        <button onClick={toggle} style={{ ...buttonStyle, padding: "6px 10px" }} aria-label="Toggle theme">
          Toggle
        </button>
      </div>
    </header>
  );
}

function Home() {
  return (
    <main style={{ padding: 16, minHeight: "calc(100vh - 66px)" }}>
      <section style={{ maxWidth: 820, margin: "12px auto" }}>
        <h2 style={{ marginTop: 6 }}>Welcome to Photobooth Booking</h2>
        <p style={{ color: "rgba(0,0,0,0.7)" }}>
          Book your photobooth for events. This demo stores bookings in your browser localStorage so nothing is sent
          externally.
        </p>

        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 12,
            background: "linear-gradient(180deg,#fff,#f7fbff)",
            boxShadow: "0 4px 18px rgba(16,24,40,0.04)",
            maxWidth: 520,
          }}
        >
          <h3 style={{ margin: "4px 0 8px" }}>Quick actions</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <Link to="/booking">
              <button style={buttonStyle}>Make a booking</button>
            </Link>
            <ExportBookingsButton />
          </div>
        </div>
      </section>
    </main>
  );
}

/* ============================
   Bookings Storage & UI
   ============================ */

type Booking = {
  id: string;
  name: string;
  email: string;
  date: string;
  time: string;
  packageName: string;
  notes?: string;
  createdAt: string;
};

function useBookings() {
  const [bookings, setBookings] = useState<Booking[]>(() =>
    safeGetLocal<Booking[]>(STORAGE_KEYS.BOOKINGS, [])
  );

  useEffect(() => {
    safeSetLocal(STORAGE_KEYS.BOOKINGS, bookings);
  }, [bookings]);

  const add = (b: Omit<Booking, "id" | "createdAt">) => {
    const newBooking: Booking = {
      ...b,
      id: `bk_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      createdAt: new Date().toISOString(),
    };
    setBookings((prev) => [newBooking, ...prev]);
    return newBooking;
  };

  const remove = (id: string) => setBookings((prev) => prev.filter((p) => p.id !== id));

  const clear = () => setBookings([]);

  return { bookings, add, remove, clear, setBookings };
}

function BookingForm({ onSaved }: { onSaved?: (b: Booking) => void }) {
  const { add } = useBookingsContext();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [pkg, setPkg] = useState("Standard");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const submit = (ev?: React.FormEvent) => {
    ev?.preventDefault();
    if (!name.trim() || !email.trim() || !date.trim() || !time.trim()) {
      // eslint-disable-next-line no-alert
      alert("Please fill name, email, date and time.");
      return;
    }
    setSaving(true);
    setTimeout(() => {
      try {
        const booking = add({
          name: name.trim(),
          email: email.trim(),
          date,
          time,
          packageName: pkg,
          notes: notes.trim() ? notes.trim() : undefined,
        });
        setName("");
        setEmail("");
        setDate("");
        setTime("");
        setPkg("Standard");
        setNotes("");
        onSaved && onSaved(booking);
        navigate("/booking");
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        // eslint-disable-next-line no-alert
        alert("Failed to save booking.");
      } finally {
        setSaving(false);
      }
    }, 300);
  };

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
      <label style={{ display: "grid" }}>
        <span style={{ fontSize: 13 }}>Full name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          aria-required
          placeholder="Jane Doe"
          style={inputStyle}
        />
      </label>

      <label style={{ display: "grid" }}>
        <span style={{ fontSize: 13 }}>Email</span>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          type="email"
          placeholder="jane@example.com"
          style={inputStyle}
        />
      </label>

      <div style={{ display: "flex", gap: 8 }}>
        <label style={{ flex: 1 }}>
          <span style={{ fontSize: 13 }}>Date</span>
          <input value={date} onChange={(e) => setDate(e.target.value)} type="date" required style={inputStyle} />
        </label>
        <label style={{ flex: 1 }}>
          <span style={{ fontSize: 13 }}>Time</span>
          <input value={time} onChange={(e) => setTime(e.target.value)} type="time" required style={inputStyle} />
        </label>
      </div>

      <label style={{ display: "grid" }}>
        <span style={{ fontSize: 13 }}>Package</span>
        <select value={pkg} onChange={(e) => setPkg(e.target.value)} style={inputStyle}>
          <option>Standard</option>
          <option>Premium</option>
          <option>Deluxe</option>
        </select>
      </label>

      <label style={{ display: "grid" }}>
        <span style={{ fontSize: 13 }}>Notes (optional)</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={inputStyle} />
      </label>

      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" style={buttonStyle} disabled={saving}>
          {saving ? "Saving?" : "Save booking"}
        </button>
        <button
          type="button"
          onClick={() => {
            setName("");
            setEmail("");
            setDate("");
            setTime("");
            setPkg("Standard");
            setNotes("");
          }}
          style={secondaryButtonStyle}
        >
          Clear
        </button>
      </div>
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid rgba(0,0,0,0.08)",
  fontSize: 14,
  boxSizing: "border-box",
  width: "100%",
};

const BookingsContext = createContext<ReturnType<typeof useBookings> | null>(null);

function BookingsProvider({ children }: { children: ReactNode }) {
  const bookings = useBookings();
  return <BookingsContext.Provider value={bookings}>{children}</BookingsContext.Provider>;
}

function useBookingsContext() {
  const ctx = useContext(BookingsContext);
  if (!ctx) throw new Error("useBookingsContext must be used within BookingsProvider");
  return ctx;
}

function BookingPage() {
  return (
    <main style={{ padding: 16, minHeight: "calc(100vh - 66px)" }}>
      <section style={{ maxWidth: 820, margin: "12px auto" }}>
        <h2>Bookings</h2>
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "1fr",
            background: "linear-gradient(180deg,#fff,#fcfffb)",
            padding: 16,
            borderRadius: 12,
          }}
        >
          <BookingsProvider>
            <div style={{ display: "grid", gap: 12 }}>
              <BookingForm />
              <BookingsList />
            </div>
          </BookingsProvider>
        </div>
      </section>
    </main>
  );
}

function BookingsList() {
  const { bookings, remove, clear } = useBookingsContext();

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>Current bookings ({bookings.length})</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <ExportBookingsButton />
          <button
            onClick={() => {
              if (!confirm("Clear all bookings? This is permanent.")) return;
              clear();
            }}
            style={secondaryButtonStyle}
            aria-label="Clear bookings"
          >
            Clear all
          </button>
        </div>
      </div>

      {bookings.length === 0 ? (
        <p style={{ color: "rgba(0,0,0,0.6)" }}>No bookings yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
          {bookings.map((b) => (
            <li
              key={b.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: 12,
                borderRadius: 10,
                background: "rgba(0,0,0,0.03)",
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{b.name}</div>
                <div style={{ fontSize: 13, color: "rgba(0,0,0,0.6)" }}>
                  {b.date} @ {b.time} ? {b.packageName}
                </div>
                <div style={{ fontSize: 13, color: "rgba(0,0,0,0.6)" }}>{b.email}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => {
                    const out = `Booking for ${b.name} (${b.email}) on ${b.date} at ${b.time} - ${b.packageName}`;
                    try {
                      navigator.clipboard.writeText(out);
                      // eslint-disable-next-line no-alert
                      alert("Copied booking summary to clipboard");
                    } catch {
                      // eslint-disable-next-line no-alert
                      alert(out);
                    }
                  }}
                  style={buttonStyle}
                >
                  Copy
                </button>
                <button
                  onClick={() => {
                    if (!confirm("Delete this booking?")) return;
                    remove(b.id);
                  }}
                  style={{ ...secondaryButtonStyle, background: "#fff" }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ExportBookingsButton() {
  const { bookings } = (() => {
    try {
      // try to grab bookings quickly without provider via storage
      const stored = safeGetLocal<Booking[]>(STORAGE_KEYS.BOOKINGS, []);
      return { bookings: stored };
    } catch {
      return { bookings: [] as Booking[] };
    }
  })();

  const exportJson = () => {
    const data = JSON.stringify(bookings, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "photobooth-bookings.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <button onClick={exportJson} style={secondaryButtonStyle} aria-label="Export bookings">
      Export
    </button>
  );
}

/* ============================
   App Component (Root)
   ============================ */

export default function App(): JSX.Element {
  return (
    <AppProviders>
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          background:
            "linear-gradient(180deg, rgba(248,250,252,1) 0%, rgba(255,255,255,1) 100%)",
        }}
      >
        <Header />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/booking" element={<BookingPage />} />
          <Route
            path="*"
            element={
              <main style={{ padding: 16 }}>
                <h2>Not found</h2>
                <p>
                  The page you're looking for does not exist. <Link to="/">Go home</Link>
                </p>
              </main>
            }
          />
        </Routes>
      </div>
    </AppProviders>
  );
}