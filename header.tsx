const THEME_KEY = "photobooth_theme";

type ThemeOption = "system" | "light" | "dark";

/**
 * ThemeToggle
 * - cycles through: system -> light -> dark -> system
 * - persists choice to localStorage
 * - applies effective theme to document.documentElement via data-theme="light" | "dark"
 * - when "system" is selected, watches prefers-color-scheme and updates accordingly
 */
export function ThemeToggle(): JSX.Element {
  const [theme, setTheme] = useState<ThemeOption>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY) as ThemeOption | null;
      return saved ?? "system";
    } catch {
      return "system";
    }
  });

  const mqlRef = useRef<MediaQueryList | null>(null);
  const themeRef = useRef<ThemeOption>(theme);

  // compute and apply effective theme (light/dark) based on selection + system preference
  const applyEffectiveTheme = (sel: ThemeOption) => {
    const prefersDark =
      typeof window !== "undefined" &&
      Boolean(window.matchMedia) &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;

    const effective = sel === "system" ? (prefersDark ? "dark" : "light") : sel;
    try {
      document.documentElement.setAttribute("data-theme", effective);
    } catch {
      // noop for SSR or strict environments
    }
  };

  // keep themeRef in sync, apply theme and persist on theme change
  useEffect(() => {
    themeRef.current = theme;
    applyEffectiveTheme(theme);

    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  // register prefers-color-scheme listener once; handler reads themeRef to decide behavior
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    mqlRef.current = window.matchMedia("(prefers-color-scheme: dark)");

    const handler = () => {
      if (themeRef.current === "system") {
        applyEffectiveTheme("system");
      }
    };

    if (mqlRef.current.addEventListener) {
      mqlRef.current.addEventListener("change", handler);
    } else {
      // older browsers
      mqlRef.current.addListener(handler);
    }

    return () => {
      if (!mqlRef.current) return;
      if (mqlRef.current.removeEventListener) {
        mqlRef.current.removeEventListener("change", handler);
      } else {
        mqlRef.current.removeListener(handler);
      }
    };
  }, []);

  // cycle order
  const order: ThemeOption[] = ["system", "light", "dark"];
  const next = (current: ThemeOption) => {
    const idx = order.indexOf(current);
    return order[(idx + 1) % order.length];
  };

  const labelFor = (opt: ThemeOption) => {
    switch (opt) {
      case "system":
        return "System theme";
      case "light":
        return "Light theme";
      case "dark":
        return "Dark theme";
      default:
        return "Theme";
    }
  };

  // accessible icon SVGs
  const icons: Record<ThemeOption, JSX.Element> = {
    system: (
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M12 3v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 19v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4.2 4.2l1.4 1.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18.4 18.4l1.4 1.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M1 12h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M21 12h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4.2 19.8l1.4-1.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18.4 5.6l1.4-1.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    light: (
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 2v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 20v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4.2 4.2l1.4 1.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18.4 18.4l1.4 1.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    dark: (
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  };

  const handleClick = () => setTheme((prev) => next(prev));

  const tooltip = `${labelFor(theme)} (click to change)`;

  return (
    <button
      type="button"
      aria-label={`Theme: ${labelFor(theme)} ? Click to change`}
      title={tooltip}
      onClick={handleClick}
      className="theme-toggle"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: 8,
        borderRadius: 8,
        border: "none",
        background: "transparent",
        cursor: "pointer",
      }}
    >
      <span aria-hidden="true" style={{ display: "inline-flex", color: "currentColor" }}>
        {icons[theme]}
      </span>
      <span style={{ display: "none" }}>{labelFor(theme)}</span>
    </button>
  );
}

type HeaderProps = {
  title?: string;
  subtitle?: string;
  onMenuToggle?: () => void;
  showMenuButton?: boolean;
  className?: string;
};

export default function Header(props?: HeaderProps): JSX.Element {
  const {
    title = "Photobooth",
    subtitle = "Booking",
    onMenuToggle,
    showMenuButton = true,
    className = "",
  } = props ?? {};

  const [menuOpen, setMenuOpen] = useState(false);

  const handleMenu = () => {
    const nextState = !menuOpen;
    setMenuOpen(nextState);
    if (onMenuToggle) onMenuToggle();
  };

  return (
    <header
      role="banner"
      className={`app-header ${className}`}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "12px 16px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          minWidth: 0,
        }}
      >
        {showMenuButton && (
          <button
            type="button"
            onClick={handleMenu}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="menu-button"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: 8,
              border: "none",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            <span aria-hidden="true" style={{ display: "inline-flex" }}>
              {menuOpen ? (
                // close icon
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M6 6l12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                // hamburger icon
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M3 12h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M3 6h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M3 18h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
          </button>
        )}

        <button
          type="button"
          // no-op by default; keep as button for correct semantics when brand is not a navigation link
          onClick={() => {
            /* Intentionally left blank. If navigation is desired, supply onBrandClick via props (not implemented here). */
          }}
          className="brand"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            textDecoration: "none",
            color: "inherit",
            minWidth: 0,
            border: "none",
            background: "transparent",
            padding: 0,
            cursor: "pointer",
            textAlign: "left",
          }}
          aria-label={`${title} ? ${subtitle}`}
        >
          <span
            className="brand-title"
            style={{
              fontSize: 16,
              fontWeight: 700,
              lineHeight: 1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title}
          </span>
          <span
            className="brand-subtitle"
            style={{
              fontSize: 12,
              opacity: 0.8,
              lineHeight: 1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {subtitle}
          </span>
        </button>
      </div>

      <nav
        aria-label="Primary actions"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <ThemeToggle />
        {/* Placeholder for additional header actions (profile, quick links) */}
        <button
          type="button"
          aria-label="Help"
          title="Help"
          onClick={() => {
            // minimal inline fallback; real app may route/open modal
            try {
              // eslint-disable-next-line no-alert
              alert("Help & support ? This is a demo photobooth booking app.");
            } catch {
              // noop
            }
          }}
          className="help-button"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: 8,
            borderRadius: 8,
            border: "none",
            background: "transparent",
            cursor: "pointer",
          }}
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 18h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9.09 9a3 3 0 1 1 5.82 1c0 2-3 2.75-3 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </nav>
    </header>
  );
}