const visuallyHiddenStyle: React.CSSProperties = {
  border: 0,
  clip: "rect(0 0 0 0)",
  height: "1px",
  margin: "-1px",
  overflow: "hidden",
  padding: 0,
  position: "absolute",
  width: "1px",
  whiteSpace: "nowrap",
};

export default function Footer(): JSX.Element {
  const businessName = "Snapshot Photobooth";
  const email = "hello@snapshotbooth.com";
  const phone = "+1 (555) 123-4567";
  const address = "1234 Event Lane, Suite 100, Austin, TX";
  const year = new Date().getFullYear();

  const getInitialTheme = (): Theme => {
    try {
      const stored = localStorage.getItem("theme");
      if (stored === "light" || stored === "dark") return stored;
    } catch {
      /* ignore */
    }
    if (typeof window !== "undefined" && window.matchMedia) {
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    }
    return "light";
  };

  const [theme, setTheme] = useState<Theme>(() => {
    // lazy init to avoid SSR issues
    if (typeof window === "undefined") return "light";
    return getInitialTheme();
  });

  // apply theme to document root and persist
  useEffect(() => {
    try {
      const root = document.documentElement;
      root.setAttribute("data-theme", theme);
      localStorage.setItem("theme", theme);
    } catch {
      // silent
    }
  }, [theme]);

  // Accessible and keyboard-friendly "Back to top"
  const scrollToTop = () => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleTheme = () => setTheme((t) => (t === "light" ? "dark" : "light"));

  const phoneHref = `tel:+${phone.replace(/\D/g, "")}`;

  return (
    <footer
      role="contentinfo"
      aria-label="Site footer"
      style={{
        padding: "2rem 1rem",
        borderTop: "1px solid rgba(0,0,0,0.06)",
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.02))",
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
        alignItems: "stretch",
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <rect width="24" height="24" rx="6" fill="#111827" opacity="0.08" />
              <path
                d="M8 7h8M9 11a3 3 0 100-6 3 3 0 000 6zM5 17a3 3 0 016 0v0"
                stroke="#111827"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                opacity="0.9"
              />
            </svg>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontWeight: 700, fontSize: "1rem" }}>{businessName}</span>
              <span style={{ fontSize: "0.875rem", color: "rgba(0,0,0,0.6)" }}>
                Photobooth for events & private parties
              </span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              alignItems: "center",
            }}
          >
            <button
              onClick={toggleTheme}
              aria-pressed={theme === "dark"}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
              type="button"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 0.75rem",
                background: "transparent",
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: "0.9rem",
              }}
            >
              {theme === "dark" ? (
                <>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  </svg>
                  Dark
                </>
              ) : (
                <>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.4" fill="none" />
                  </svg>
                  Light
                </>
              )}
            </button>

            <button
              onClick={scrollToTop}
              aria-label="Back to top"
              type="button"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 0.75rem",
                background: "transparent",
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: "0.9rem",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M12 5v14M5 12l7-7 7 7"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
              Top
            </button>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            borderTop: "1px dashed rgba(0,0,0,0.04)",
            paddingTop: "1rem",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
            }}
          >
            <address style={{ fontStyle: "normal", lineHeight: 1.35 }}>
              <strong style={{ display: "block", marginBottom: 4 }}>{businessName}</strong>
              <a
                href={`mailto:${email}`}
                style={{ color: "inherit", textDecoration: "none" }}
                aria-label={`Email ${businessName}`}
              >
                {email}
              </a>
              <span style={{ display: "block", color: "rgba(0,0,0,0.66)", marginTop: 4 }}>
                <a
                  href={phoneHref}
                  style={{ color: "inherit", textDecoration: "none" }}
                  aria-label={`Call ${businessName}`}
                >
                  {phone}
                </a>{" "}
                ? {address}
              </span>
            </address>
          </div>

          <nav aria-label="Footer" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <a
              href="/book"
              style={{
                padding: "0.45rem 0.6rem",
                borderRadius: 6,
                textDecoration: "none",
                border: "1px solid rgba(0,0,0,0.06)",
                background: "transparent",
                fontSize: "0.9rem",
              }}
            >
              Book a Session
            </a>
            <a
              href="/gallery"
              style={{
                padding: "0.45rem 0.6rem",
                borderRadius: 6,
                textDecoration: "none",
                border: "1px solid rgba(0,0,0,0.06)",
                background: "transparent",
                fontSize: "0.9rem",
              }}
            >
              Gallery
            </a>
            <a
              href="/pricing"
              style={{
                padding: "0.45rem 0.6rem",
                borderRadius: 6,
                textDecoration: "none",
                border: "1px solid rgba(0,0,0,0.06)",
                background: "transparent",
                fontSize: "0.9rem",
              }}
            >
              Pricing
            </a>
            <a
              href="/privacy"
              style={{
                padding: "0.45rem 0.6rem",
                borderRadius: 6,
                textDecoration: "none",
                border: "1px solid rgba(0,0,0,0.06)",
                background: "transparent",
                fontSize: "0.9rem",
              }}
            >
              Privacy
            </a>
            <a
              href="/terms"
              style={{
                padding: "0.45rem 0.6rem",
                borderRadius: 6,
                textDecoration: "none",
                border: "1px solid rgba(0,0,0,0.06)",
                background: "transparent",
                fontSize: "0.9rem",
              }}
            >
              Terms
            </a>
          </nav>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            <p style={{ margin: 0, color: "rgba(0,0,0,0.6)", fontSize: "0.9rem" }}>
              ? {year} {businessName}. All rights reserved.
            </p>

            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <a
                href="https://www.instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram (opens in a new tab)"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.06)",
                  textDecoration: "none",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="2" y="2" width="20" height="20" rx="5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M16 11.37a4 4 0 11-8 0 4 4 0 018 0z" stroke="currentColor" strokeWidth="1.2" fill="none" />
                  <path d="M17.5 6.5h.01" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </a>

              <a
                href="https://www.facebook.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook (opens in a new tab)"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.06)",
                  textDecoration: "none",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M18 2h-3a4 4 0 00-4 4v3H8v4h3v8h4v-8h3l1-4h-4V6a1 1 0 011-1h3V2z" stroke="currentColor" strokeWidth="1.2" fill="none" />
                </svg>
              </a>

              <a
                href={`mailto:${email}`}
                aria-label={`Email ${businessName}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.06)",
                  textDecoration: "none",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M3 8l9 6 9-6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.2" fill="none" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>

      <span style={visuallyHiddenStyle} aria-hidden={true}>
        {businessName}
      </span>
    </footer>
  );
}