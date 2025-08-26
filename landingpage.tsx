const LOCAL_STORAGE_KEY = "publicPackages_v1";

/**
 * Reads public packages from localStorage or seeds defaults if none exist.
 * Returns only packages with isPublic !== false
 */
export async function fetchPublicPackages(): Promise<PackageItem[]> {
  // Simulate async fetch with a tiny delay to allow loading UI
  await new Promise((resolve) => setTimeout(resolve, 250));

  // Helper to safely access localStorage only when available
  const safeGetLocalStorage = (key: string): string | null => {
    try {
      if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
        return window.localStorage.getItem(key);
      }
    } catch {
      // ignore
    }
    return null;
  };

  const safeSetLocalStorage = (key: string, value: string) => {
    try {
      if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
        window.localStorage.setItem(key, value);
      }
    } catch {
      // ignore (e.g. private mode)
    }
  };

  try {
    const raw = safeGetLocalStorage(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PackageItem[];
      if (Array.isArray(parsed)) {
        return parsed.filter((p) => p.isPublic !== false);
      }
    }
  } catch {
    // ignore parse/localStorage errors and fall through to seed defaults
  }

  // Default demo packages (seed)
  const defaults: PackageItem[] = [
    {
      id: "classic-60",
      title: "Classic 60",
      shortDescription: "60 minutes of open-air photobooth fun",
      longDescription:
        "Perfect for small events. Includes props, onsite attendant, and unlimited prints.",
      priceCents: 35000,
      durationMinutes: 60,
      features: ["Unlimited prints", "Props included", "Onsite attendant"],
      isPublic: true,
    },
    {
      id: "deluxe-120",
      title: "Deluxe 120",
      shortDescription: "Extended 2-hour session with premium props",
      longDescription:
        "Great for weddings and corporate events. Includes backdrops and custom overlay.",
      priceCents: 60000,
      durationMinutes: 120,
      features: ["Custom overlay", "Premium props", "Backdrop choices"],
      isPublic: true,
    },
    {
      id: "mini-30",
      title: "Mini 30",
      shortDescription: "Short & sweet ? perfect for parties on a schedule",
      longDescription:
        "Compact session for quick guest rotations. Includes digital gallery.",
      priceCents: 20000,
      durationMinutes: 30,
      features: ["Digital gallery", "Fast setup", "Great for tight schedules"],
      isPublic: true,
    },
  ];

  safeSetLocalStorage(LOCAL_STORAGE_KEY, JSON.stringify(defaults));

  return defaults.filter((p) => p.isPublic !== false);
}

/**
 * LandingPage component ? hero + public package list + CTA.
 */
export default function LandingPage(): JSX.Element {
  const [packages, setPackages] = useState<PackageItem[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // For Info modal
  const [infoPkg, setInfoPkg] = useState<PackageItem | null>(null);
  const infoCloseRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    fetchPublicPackages()
      .then((pkgs) => {
        if (!mounted) return;
        setPackages(pkgs);
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        setError("Unable to load packages.");
        setPackages([]);
        setLoading(false);
        // Optional: log to console for dev
        // eslint-disable-next-line no-console
        console.error("fetchPublicPackages error:", err);
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Focus management & escape handling for info modal
  useEffect(() => {
    if (!infoPkg) return;

    // Focus the close button when modal opens
    try {
      if (infoCloseRef.current) {
        infoCloseRef.current.focus();
      }
    } catch {
      // ignore
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setInfoPkg(null);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("keydown", onKey);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("keydown", onKey);
      }
    };
  }, [infoPkg]);

  /**
   * Primary CTA handler. Navigates to booking route.
   * If a packageId is provided, it will be appended as query param.
   *
   * Behavior:
   * - Try to use history.pushState for SPA-friendly navigation and dispatch popstate.
   * - Fallback to setting window.location.href if pushState is unavailable.
   */
  function handleCTA(packageId?: string): void {
    const targetPath = `/booking${packageId ? `?package=${encodeURIComponent(packageId)}` : ""}`;

    if (typeof window === "undefined") {
      return;
    }

    try {
      if (window && typeof window.history?.pushState === "function") {
        try {
          window.history.pushState({ from: "landing" }, "", targetPath);
        } catch {
          // ignore pushState failures and try fallback dispatch below
        }

        // Some routers listen to popstate or custom events; dispatch popstate to be safe.
        try {
          // PopStateEvent may not exist in all environments (rare), so fallback to Event
          const pop =
            typeof PopStateEvent === "function"
              ? new PopStateEvent("popstate", { state: { from: "landing" } })
              : new Event("popstate");
          window.dispatchEvent(pop);
        } catch {
          // ignore
        }

        // Set focus to top for accessibility
        try {
          window.scrollTo({ top: 0, behavior: "smooth" });
        } catch {
          // ignore
        }
      } else {
        window.location.href = targetPath;
      }
    } catch {
      try {
        // final fallback
        window.location.href = targetPath;
      } catch {
        // if even that fails, do nothing
      }
    }
  }

  const formatPrice = (cents: number) =>
    (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });

  return (
    <main
      role="main"
      aria-labelledby="landing-hero-title"
      className="landing-page container"
      style={{
        padding: "1rem",
        maxWidth: 1100,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
      }}
    >
      <section
        className="hero"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          alignItems: "flex-start",
          marginBottom: "1.5rem",
        }}
      >
        <h1
          id="landing-hero-title"
          style={{
            fontSize: "clamp(1.5rem, 4vw, 2.25rem)",
            lineHeight: 1.05,
            margin: 0,
          }}
        >
          Make memories ? Book your photobooth
        </h1>
        <p
          style={{
            margin: 0,
            color: "var(--muted, #666)",
            maxWidth: 720,
          }}
        >
          A simple booking experience for weddings, parties, and corporate events.
          Choose a package, pick a date, and we?ll handle the rest.
        </p>

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
          <button
            onClick={() => handleCTA()}
            className="cta primary"
            aria-label="Start booking"
            style={{
              padding: "0.6rem 1rem",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              background: "linear-gradient(90deg,#0ea5e9,#6366f1)",
              color: "#fff",
              fontWeight: 600,
            }}
          >
            Book now
          </button>

          <button
            onClick={() => {
              // Scroll to packages ? simple in-page navigation
              if (typeof document !== "undefined") {
                const el = document.getElementById("packages-section");
                if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
              }
            }}
            className="cta secondary"
            aria-label="Browse packages"
            style={{
              padding: "0.6rem 1rem",
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.08)",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            Browse packages
          </button>
        </div>
      </section>

      <section id="packages-section" aria-labelledby="packages-title">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 id="packages-title" style={{ fontSize: "1.125rem", margin: "0 0 0.75rem 0" }}>
            Popular packages
          </h2>
          <p style={{ margin: 0, color: "var(--muted, #666)", fontSize: "0.9rem" }}>
            Prices include onsite attendant and standard prints
          </p>
        </div>

        {loading ? (
          <div
            aria-live="polite"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))",
              gap: "0.75rem",
            }}
          >
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="card skeleton"
                aria-hidden="true"
                style={{
                  padding: "0.75rem",
                  borderRadius: 10,
                  background: "linear-gradient(90deg,#f3f4f6,#fff)",
                  minHeight: 120,
                }}
              />
            ))}
          </div>
        ) : error ? (
          <div role="alert" style={{ color: "var(--danger,#b91c1c)" }}>
            <p style={{ margin: 0 }}>{error}</p>
            <div style={{ marginTop: 8 }}>
              <button
                onClick={() => {
                  setLoading(true);
                  setError(null);
                  fetchPublicPackages()
                    .then((pkgs) => {
                      setPackages(pkgs);
                      setLoading(false);
                    })
                    .catch(() => {
                      setError("Unable to load packages.");
                      setLoading(false);
                    });
                }}
                style={{
                  padding: "0.5rem 0.75rem",
                  borderRadius: 8,
                  border: "none",
                  background: "#111827",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Retry
              </button>
            </div>
          </div>
        ) : packages && packages.length > 0 ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))",
              gap: "0.75rem",
            }}
          >
            {packages.map((pkg) => (
              <article
                key={pkg.id}
                className="package-card"
                tabIndex={0}
                role="button"
                aria-labelledby={`pkg-title-${pkg.id}`}
                onClick={() => handleCTA(pkg.id)}
                onKeyDown={(e: React.KeyboardEvent) => {
                  // Handle Enter and Space for activation
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCTA(pkg.id);
                  } else if (e.key === " ") {
                    // prevent page scroll
                    e.preventDefault();
                    handleCTA(pkg.id);
                  }
                }}
                style={{
                  padding: "0.75rem",
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.06)",
                  background: "var(--card-bg, #fff)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div>
                    <h3
                      id={`pkg-title-${pkg.id}`}
                      style={{ margin: 0, fontSize: "1rem", lineHeight: 1.1 }}
                    >
                      {pkg.title}
                    </h3>
                    <p style={{ margin: "4px 0 0 0", fontSize: "0.9rem", color: "#444" }}>
                      {pkg.shortDescription}
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700 }}>{formatPrice(pkg.priceCents)}</div>
                    <div style={{ fontSize: "0.85rem", color: "var(--muted,#666)" }}>
                      {pkg.durationMinutes} min
                    </div>
                  </div>
                </div>

                {pkg.features && pkg.features.length > 0 && (
                  <ul style={{ margin: "0.25rem 0 0 0.75rem", padding: 0, listStyle: "disc" }}>
                    {pkg.features.slice(0, 3).map((f, idx) => (
                      <li key={idx} style={{ fontSize: "0.85rem", color: "#444" }}>
                        {f}
                      </li>
                    ))}
                  </ul>
                )}

                <div style={{ marginTop: "auto", display: "flex", gap: "0.5rem" }}>
                  <button
                    onClick={(e) => {
                      // prevent outer click handler from firing
                      e.stopPropagation();
                      handleCTA(pkg.id);
                    }}
                    aria-label={`Book ${pkg.title}`}
                    style={{
                      marginTop: "0.5rem",
                      padding: "0.45rem 0.6rem",
                      borderRadius: 8,
                      border: "none",
                      cursor: "pointer",
                      background: "#10b981",
                      color: "#fff",
                      fontWeight: 600,
                      flex: 1,
                    }}
                  >
                    Book
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setInfoPkg(pkg);
                    }}
                    aria-label={`More info about ${pkg.title}`}
                    style={{
                      marginTop: "0.5rem",
                      padding: "0.45rem 0.6rem",
                      borderRadius: 8,
                      border: "1px solid rgba(0,0,0,0.06)",
                      background: "transparent",
                      cursor: "pointer",
                      flex: 0.8,
                    }}
                  >
                    Info
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div role="status" aria-live="polite" style={{ color: "var(--muted,#666)" }}>
            No packages available right now. Please check back later.
          </div>
        )}
      </section>

      {/* Simple accessible modal for package info */}
      {infoPkg && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`info-title-${infoPkg.id}`}
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.4)",
            zIndex: 1000,
            padding: "1rem",
          }}
          onClick={() => setInfoPkg(null)}
        >
          <div
            role="document"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--card-bg, #fff)",
              color: "inherit",
              borderRadius: 12,
              maxWidth: 720,
              width: "100%",
              padding: "1rem",
              boxShadow: "0 6px 24px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <h3 id={`info-title-${infoPkg.id}`} style={{ margin: 0 }}>
                {infoPkg.title}
              </h3>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700 }}>{formatPrice(infoPkg.priceCents)}</div>
                <div style={{ fontSize: "0.85rem", color: "var(--muted,#666)" }}>
                  {infoPkg.durationMinutes} min
                </div>
              </div>
            </div>

            <p style={{ marginTop: "0.5rem", color: "#444" }}>
              {infoPkg.longDescription || infoPkg.shortDescription || infoPkg.title}
            </p>

            {infoPkg.features && infoPkg.features.length > 0 && (
              <ul style={{ marginTop: "0.5rem" }}>
                {infoPkg.features.map((f, i) => (
                  <li key={i} style={{ color: "#444" }}>
                    {f}
                  </li>
                ))}
              </ul>
            )}

            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
              <button
                ref={infoCloseRef}
                onClick={() => setInfoPkg(null)}
                style={{
                  padding: "0.5rem 0.75rem",
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.06)",
                  background: "transparent",
                  cursor: "pointer",
                }}
              >
                Close
              </button>

              <button
                onClick={() => {
                  setInfoPkg(null);
                  handleCTA(infoPkg.id);
                }}
                style={{
                  padding: "0.5rem 0.75rem",
                  borderRadius: 8,
                  border: "none",
                  background: "#10b981",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Book {infoPkg.title}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}