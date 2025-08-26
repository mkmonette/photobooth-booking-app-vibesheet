const STORAGE_BOOKINGS_KEY = "photobooth.bookings.v1";
const STORAGE_THEME_KEY = "photobooth.theme.v1";
const APP_TITLE = "Photobooth Booking";

function uid(prefix = "") {
  return (
    prefix +
    Math.random().toString(36).slice(2, 9) +
    "-" +
    Date.now().toString(36).slice(-5)
  );
}

function loadBookings() {
  try {
    const raw = localStorage.getItem(STORAGE_BOOKINGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

function saveBookings(bookings) {
  try {
    localStorage.setItem(STORAGE_BOOKINGS_KEY, JSON.stringify(bookings));
  } catch {
    // ignore storage errors
  }
}

function loadTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {}
  // fallback to system preference
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

function saveTheme(theme) {
  try {
    localStorage.setItem(STORAGE_THEME_KEY, theme);
  } catch {}
}

/* ---------- Global Listeners Setup ---------- */
export function setupGlobalListeners() {
  // Apply mobile safe-height variable to avoid 100vh jump on mobile browsers
  const applySafeHeight = () => {
    try {
      document.documentElement.style.setProperty(
        "--app-safe-height",
        `${window.innerHeight}px`
      );
    } catch {}
  };
  applySafeHeight();

  // Keyboard shortcuts
  const onKeyDown = (e) => {
    // ignore when focus is in an editable input or contenteditable
    const el = document.activeElement;
    const editing =
      el &&
      ((el.tagName === "INPUT" && !el.readOnly) ||
        (el.tagName === "TEXTAREA" && !el.readOnly) ||
        el.isContentEditable);
    if (editing) return;

    // Global shortcuts:
    // b -> focus booking name input (if present)
    // t -> toggle theme (dispatch custom event)
    // ? or / -> show quick help (dispatch custom event)
    if (e.key === "b" || e.key === "B") {
      const target = document.querySelector<HTMLInputElement>("#booking-name");
      if (target) {
        target.focus();
        target.select?.();
        e.preventDefault();
      }
    } else if (e.key === "t" || e.key === "T") {
      // custom event to toggle theme
      window.dispatchEvent(new CustomEvent("photobooth:toggle-theme"));
      e.preventDefault();
    } else if (e.key === "?" || e.key === "/") {
      window.dispatchEvent(new CustomEvent("photobooth:show-help"));
      e.preventDefault();
    }
  };

  // Save on visibility change
  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      // allow other components to flush state
      window.dispatchEvent(new CustomEvent("photobooth:save-state"));
    }
  };

  // Online/offline
  const onOnline = () => {
    document.documentElement.dataset.online = "true";
    window.dispatchEvent(new CustomEvent("photobooth:online-status", { detail: true }));
  };
  const onOffline = () => {
    document.documentElement.dataset.online = "false";
    window.dispatchEvent(new CustomEvent("photobooth:online-status", { detail: false }));
  };

  // beforeunload: attempt to save
  const onBeforeUnload = () => {
    window.dispatchEvent(new CustomEvent("photobooth:save-state"));
  };

  // Resize
  const onResize = () => {
    applySafeHeight();
  };

  document.addEventListener("keydown", onKeyDown, { passive: true });
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  window.addEventListener("beforeunload", onBeforeUnload);
  window.addEventListener("resize", onResize, { passive: true });

  // initialize online status attribute
  document.documentElement.dataset.online = navigator.onLine ? "true" : "false";
}

/* ---------- App Component ---------- */
export default function App(props) {
  const [bookings, setBookings] = useState(() => loadBookings());
  const [theme, setTheme] = useState(() => loadTheme());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [feedback, setFeedback] = useState("");
  const [helpVisible, setHelpVisible] = useState(false);
  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const dateRef = useRef(null);
  const packageRef = useRef(null);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("theme-dark");
      root.classList.remove("theme-light");
      root.setAttribute("data-theme", "dark");
    } else {
      root.classList.add("theme-light");
      root.classList.remove("theme-dark");
      root.setAttribute("data-theme", "light");
    }
    saveTheme(theme);
  }, [theme]);

  // Persist bookings when changed
  useEffect(() => {
    saveBookings(bookings);
  }, [bookings]);

  // Setup global listeners and custom events
  useEffect(() => {
    const onToggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
    const onShowHelp = () => setHelpVisible((v) => !v);
    const onSaveState = () => {
      saveBookings(bookings);
      saveTheme(theme);
    };
    const onOnlineStatus = (e) => {
      const val = e?.detail;
      if (typeof val === "boolean") setIsOnline(val);
      else setIsOnline(navigator.onLine);
    };

    window.addEventListener("photobooth:toggle-theme", onToggleTheme);
    window.addEventListener("photobooth:show-help", onShowHelp);
    window.addEventListener("photobooth:save-state", onSaveState);
    window.addEventListener("photobooth:online-status", onOnlineStatus);

    // call setupGlobalListeners once
    setupGlobalListeners();

    return () => {
      window.removeEventListener("photobooth:toggle-theme", onToggleTheme);
      window.removeEventListener("photobooth:show-help", onShowHelp);
      window.removeEventListener("photobooth:save-state", onSaveState);
      window.removeEventListener("photobooth:online-status", onOnlineStatus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only once

  // Listen to save-state to persist current bookings when requested externally
  useEffect(() => {
    const handler = () => saveBookings(bookings);
    window.addEventListener("photobooth:save-state", handler);
    return () => window.removeEventListener("photobooth:save-state", handler);
  }, [bookings]);

  // Update document title small hint
  useEffect(() => {
    const base = APP_TITLE;
    document.title = `${base} ? ${bookings.length} booking${bookings.length !== 1 ? "s" : ""}`;
  }, [bookings.length]);

  function addBooking(e) {
    e?.preventDefault();
    const name = nameRef.current?.value?.trim() || "";
    const email = emailRef.current?.value?.trim() || "";
    const datetime = dateRef.current?.value || "";
    const pkg = packageRef.current?.value || "Standard";

    if (!name) {
      setFeedback("Please provide a name.");
      nameRef.current?.focus();
      return;
    }
    if (!email) {
      setFeedback("Please provide an email.");
      emailRef.current?.focus();
      return;
    }
    if (!datetime) {
      setFeedback("Please choose a date and time.");
      dateRef.current?.focus();
      return;
    }
    const when = new Date(datetime);
    if (isNaN(when.getTime())) {
      setFeedback("Invalid date/time.");
      dateRef.current?.focus();
      return;
    }
    if (when.getTime() < Date.now() - 1000 * 60 * 60) {
      setFeedback("Please choose a future date/time.");
      dateRef.current?.focus();
      return;
    }

    const newBooking = {
      id: uid("b_"),
      name,
      email,
      datetime: when.toISOString(),
      package: pkg,
      createdAt: new Date().toISOString(),
    };
    const updated = [newBooking, ...bookings].slice(0, 100); // keep a cap
    setBookings(updated);
    setFeedback("Booking saved.");
    // clear form
    nameRef.current.value = "";
    emailRef.current.value = "";
    dateRef.current.value = "";
    packageRef.current.value = "Standard";
    nameRef.current?.focus();

    // Announce to assistive tech
    const live = document.getElementById("app-live");
    if (live) live.textContent = "Booking saved.";
  }

  function removeBooking(id) {
    const b = bookings.find((x) => x.id === id);
    if (!b) return;
    if (!confirm(`Remove booking for ${b.name} on ${new Date(b.datetime).toLocaleString()}?`)) {
      return;
    }
    const updated = bookings.filter((x) => x.id !== id);
    setBookings(updated);
    setFeedback("Booking removed.");
    const live = document.getElementById("app-live");
    if (live) live.textContent = "Booking removed.";
  }

  function exportBookings() {
    const data = JSON.stringify(bookings, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "photobooth-bookings.json";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 200);
  }

  function importBookingsFromFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed)) throw new Error("Invalid file");
        // Basic normalization and merging
        const normalized = parsed
          .map((p) => ({
            id: p.id || uid("imp_"),
            name: String(p.name || "").trim(),
            email: String(p.email || "").trim(),
            datetime:
              p.datetime && !isNaN(new Date(p.datetime).getTime())
                ? new Date(p.datetime).toISOString()
                : null,
            package: p.package || "Standard",
            createdAt: p.createdAt || new Date().toISOString(),
          }))
          .filter((p) => p.name && p.email && p.datetime);
        const merged = [...normalized, ...bookings].slice(0, 500);
        setBookings(merged);
        setFeedback(`Imported ${normalized.length} booking(s).`);
      } catch (err) {
        setFeedback("Failed to import bookings: invalid file.");
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="app-root" role="application" aria-labelledby="app-title">
      <style>{`
        :root {
          --bg: #fff;
          --fg: #111827;
          --muted: #6b7280;
          --accent: #2563eb;
          --card: #f9fafb;
          --radius: 12px;
        }
        :root.theme-dark {
          --bg: #0b1220;
          --fg: #e6eef8;
          --muted: #9aa6b2;
          --accent: #60a5fa;
          --card: #071025;
        }
        * { box-sizing: border-box; }
        html,body,#root { height: 100%; }
        body { margin:0; font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial; background:var(--bg); color:var(--fg); }
        .app-root { min-height: 100vh; padding: 20px; display:flex; flex-direction: column; gap:16px; max-width:900px; margin: 0 auto; }
        header { display:flex; gap:12px; align-items:center; justify-content:space-between; }
        .brand { display:flex; gap:12px; align-items:center; }
        .logo { width:48px; height:48px; border-radius:10px; background:linear-gradient(135deg,var(--accent), #7c3aed); display:inline-block; box-shadow: 0 6px 18px rgba(2,6,23,0.12); }
        h1 { margin:0; font-size:1.125rem; letter-spacing: -0.01em; }
        .controls { display:flex; gap:8px; align-items:center; }
        button { background:transparent; color:var(--fg); border:1px solid rgba(0,0,0,0.06); padding:8px 10px; border-radius:10px; cursor:pointer; }
        .btn-primary { background:var(--accent); color:white; border:none; padding:10px 14px; border-radius:10px; }
        main { display:flex; flex-direction:column; gap:16px; }
        .card { background:var(--card); padding:12px; border-radius:var(--radius); box-shadow: 0 6px 18px rgba(2,6,23,0.04); }
        form { display:flex; flex-direction:column; gap:8px; }
        label { font-size:0.9rem; color:var(--muted); }
        input, select { padding:10px; border-radius:8px; border:1px solid rgba(0,0,0,0.06); background:transparent; color:var(--fg); }
        .row { display:flex; gap:8px; flex-wrap:wrap; }
        .col { flex:1 1 200px; min-width: 150px; }
        ul.bookings { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:8px; }
        li.booking { display:flex; justify-content:space-between; gap:12px; padding:10px; border-radius:10px; background: linear-gradient(180deg, rgba(255,255,255,0.02), transparent); align-items:center; }
        .meta { display:flex; flex-direction:column; gap:2px; }
        .muted { color:var(--muted); font-size:0.85rem; }
        .badge { font-size:0.8rem; padding:6px 8px; border-radius:999px; background:rgba(0,0,0,0.06); }
        .feedback { color: var(--muted); font-size:0.9rem; }
        .help { position:fixed; right:18px; bottom:18px; background:var(--card); padding:12px; border-radius:12px; box-shadow: 0 10px 30px rgba(2,6,23,0.12); max-width:320px; }
        @media (min-width: 700px) {
          .app-root { padding:32px; }
        }
      `}</style>

      <header aria-hidden={false}>
        <div className="brand">
          <span className="logo" aria-hidden="true" />
          <div>
            <h1 id="app-title">{APP_TITLE}</h1>
            <div className="muted" style={{ fontSize: 12 }}>
              Single-business photobooth booking
            </div>
          </div>
        </div>

        <div className="controls">
          <div className="muted" aria-live="polite">{isOnline ? "Online" : "Offline"}</div>
          <button
            onClick={() => {
              setTheme((t) => (t === "dark" ? "light" : "dark"));
            }}
            aria-pressed={theme === "dark"}
            title="Toggle theme (T)"
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <button
            onClick={() => setHelpVisible((v) => !v)}
            title="Help (?)"
            aria-expanded={helpVisible}
            aria-controls="help-panel"
          >
            Help
          </button>
        </div>
      </header>

      <main>
        <section className="card" aria-labelledby="booking-form-title">
          <h2 id="booking-form-title" style={{ margin: 0, fontSize: 16 }}>
            Create booking
          </h2>
          <form onSubmit={addBooking} aria-describedby="form-desc">
            <div id="form-desc" className="muted" style={{ marginBottom: 8 }}>
              Fill in the details to reserve the photobooth.
            </div>
            <div className="row">
              <div className="col">
                <label htmlFor="booking-name">Name</label>
                <input id="booking-name" ref={nameRef} type="text" name="name" placeholder="Full name" autoComplete="name" />
              </div>
              <div className="col">
                <label htmlFor="booking-email">Email</label>
                <input id="booking-email" ref={emailRef} type="email" name="email" placeholder="you@example.com" autoComplete="email" />
              </div>
            </div>

            <div className="row">
              <div className="col">
                <label htmlFor="booking-datetime">Date & time</label>
                <input id="booking-datetime" ref={dateRef} type="datetime-local" name="datetime" />
              </div>
              <div className="col">
                <label htmlFor="booking-package">Package</label>
                <select id="booking-package" ref={packageRef} name="package" defaultValue="Standard">
                  <option>Standard</option>
                  <option>Premium</option>
                  <option>Event (3+ hours)</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button type="submit" className="btn-primary">Save booking</button>
              <button
                type="button"
                onClick={() => {
                  nameRef.current && (nameRef.current.value = "");
                  emailRef.current && (emailRef.current.value = "");
                  dateRef.current && (dateRef.current.value = "");
                  packageRef.current && (packageRef.current.value = "Standard");
                  setFeedback("Form cleared.");
                }}
              >
                Clear
              </button>
            </div>
            <div style={{ marginTop: 8 }} className="feedback" role="status" aria-live="polite">
              {feedback}
            </div>
          </form>
        </section>

        <section className="card" aria-labelledby="bookings-title">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 id="bookings-title" style={{ margin: 0, fontSize: 16 }}>Bookings ({bookings.length})</h3>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={exportBookings} title="Export bookings">Export</button>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="file"
                  accept="application/json"
                  style={{ display: "none" }}
                  onChange={(ev) => {
                    const f = ev.target.files && ev.target.files[0];
                    importBookingsFromFile(f);
                    ev.target.value = "";
                  }}
                />
                <span>Import</span>
              </label>
            </div>
          </div>

          {bookings.length === 0 ? (
            <div className="muted" style={{ marginTop: 12 }}>No bookings yet. Create one above.</div>
          ) : (
            <ul className="bookings" style={{ marginTop: 12 }}>
              {bookings.map((b) => (
                <li key={b.id} className="booking" aria-labelledby={`booking-${b.id}`}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{ width: 44, height: 44, borderRadius: 8, background: "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(0,0,0,0.03))", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
                      {String(b.name || "").slice(0,1).toUpperCase()}
                    </div>
                    <div className="meta">
                      <div id={`booking-${b.id}`} style={{ fontWeight: 600 }}>{b.name}</div>
                      <div className="muted">{b.email} ? <span className="badge">{b.package}</span></div>
                      <div className="muted" style={{ fontSize: 13 }}>{new Date(b.datetime).toLocaleString()}</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button onClick={() => {
                      // quick edit: populate form for editing (simple approach: remove original)
                      nameRef.current.value = b.name;
                      emailRef.current.value = b.email;
                      // set datetime-local input format
                      const dt = new Date(b.datetime);
                      const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0,16);
                      dateRef.current.value = local;
                      packageRef.current.value = b.package || "Standard";
                      // remove existing so saving creates a fresh entry
                      setBookings((prev) => prev.filter((x) => x.id !== b.id));
                      nameRef.current.focus();
                    }}>Edit</button>
                    <button onClick={() => removeBooking(b.id)} aria-label={`Remove booking for ${b.name}`}>Remove</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card" aria-labelledby="about-title">
          <h4 id="about-title" style={{ margin: 0 }}>About</h4>
          <div className="muted" style={{ marginTop: 8 }}>
            This demo stores bookings locally in your browser using localStorage. Use export/import to move data between devices.
          </div>
        </section>
      </main>

      <div id="app-live" style={{ position: "absolute", left: -9999, top: "auto", width: 1, height: 1, overflow: "hidden" }} aria-live="polite" aria-atomic="true" />

      {helpVisible && (
        <div id="help-panel" className="help" role="dialog" aria-modal="false" aria-labelledby="help-title">
          <h5 id="help-title" style={{ marginTop: 0 }}>Shortcuts & help</h5>
          <ul style={{ margin: "6px 0 0 16px" }}>
            <li><strong>B</strong> ? Focus name field to quickly add a booking</li>
            <li><strong>T</strong> ? Toggle theme</li>
            <li><strong>Export/Import</strong> ? Move bookings between devices</li>
          </ul>
          <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
            <button onClick={() => setHelpVisible(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Render Entrypoint ---------- */
export function renderApp(rootId = "root") {
  // Ensure a container exists
  let container = document.getElementById(rootId);
  if (!container) {
    container = document.createElement("div");
    container.id = rootId;
    document.body.appendChild(container);
  }

  // Use createRoot (React 18+). Safe guard existing root by trying to unmount first if possible.
  try {
    // If there is an existing root, attempt to unmount (no-op if not previously mounted)
    // Note: We can't reliably detect previous createRoot; unmounting container is safe.
    // Create root and render App
    const root = createRoot(container);
    root.render(React.createElement(React.StrictMode, null, React.createElement(App)));
  } catch (err) {
    // As a fallback, use legacy render
    // eslint-disable-next-line no-console
    console.warn("createRoot failed, falling back to legacy render:", err);
    // Legacy react-dom render (if available)
    // This block intentionally kept minimal; most modern projects will use createRoot.
    try {
      // eslint-disable-next-line global-require
      const ReactDOM = require("react-dom");
      ReactDOM.render(React.createElement(App), container);
    } catch (innerErr) {
      // eslint-disable-next-line no-console
      console.error("Failed to mount app:", innerErr);
    }
  }
}

// Auto-render if running in browser and not imported as a module consumer explicitly
if (typeof window !== "undefined" && window.document && document.readyState !== "loading") {
  renderApp();
} else if (typeof window !== "undefined" && window.document) {
  window.addEventListener("DOMContentLoaded", () => renderApp());
}