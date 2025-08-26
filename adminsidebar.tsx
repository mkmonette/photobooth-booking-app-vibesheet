export function AdminNavItem({
  id,
  label,
  icon,
  onClick,
  active = false,
  className = "",
}: AdminNavItemProps): JSX.Element {
  const [focused, setFocused] = useState(false);

  const handleActivate = useCallback(
    (e?: React.MouseEvent | React.KeyboardEvent) => {
      if (e && "preventDefault" in e) e.preventDefault();
      onClick?.();
    },
    [onClick]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const isEnter = e.key === "Enter";
      const isSpace = e.key === " " || e.key === "Spacebar" || e.code === "Space";
      if (isEnter || isSpace) {
        // Space or Enter should activate
        e.preventDefault(); // prevent scrolling for Space
        handleActivate(e);
      }
    },
    [handleActivate]
  );

  const baseStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 8,
    cursor: "pointer",
    userSelect: "none",
    textDecoration: "none",
    color: "inherit",
    outline: "none", // keep a neutral outline but we'll show visible focus via boxShadow when focused
    transition: "box-shadow 120ms ease, background-color 120ms ease",
  };

  const focusStyle: React.CSSProperties = focused
    ? {
        boxShadow: "0 0 0 3px rgba(11,95,255,0.18)",
        borderRadius: 8,
      }
    : {};

  const activeStyle: React.CSSProperties = active
    ? {
        backgroundColor: "var(--sidebar-active-bg, rgba(0,0,0,0.06))",
        color: "var(--sidebar-active-color, #0b5fff)",
        fontWeight: 600,
      }
    : {
        color: "var(--sidebar-color, inherit)",
      };

  return (
    <a
      href={id}
      onClick={(e) => {
        e.preventDefault();
        handleActivate();
      }}
      onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      aria-current={active ? "page" : undefined}
      className={`admin-nav-item ${className} ${active ? "active" : ""}`}
      style={{ ...baseStyle, ...focusStyle, ...activeStyle }}
      data-id={id}
    >
      {icon ? (
        <span
          aria-hidden
          style={{ display: "inline-flex", width: 20, height: 20, alignItems: "center", justifyContent: "center" }}
        >
          {icon}
        </span>
      ) : null}
      <span style={{ fontSize: 15, lineHeight: 1 }}>{label}</span>
    </a>
  );
}

export default function AdminSidebar({ onNavigate }: AdminSidebarProps): JSX.Element {
  const STORAGE_KEY = "adminSidebarActive";
  const COLLAPSE_KEY = "adminSidebarCollapsed";

  const defaultItems = useMemo(
    () => [
      {
        id: "/admin/dashboard",
        label: "Dashboard",
        icon: (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zM13 3v6h8V3h-8zm0 8v10h8V11h-8z" />
          </svg>
        ),
      },
      {
        id: "/admin/bookings",
        label: "Bookings",
        icon: (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M19 3h-1V1h-2v2H8V1H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 16H5V8h14v11z" />
          </svg>
        ),
      },
      {
        id: "/admin/customers",
        label: "Customers",
        icon: (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zM8 11c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm8 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zM8 13c-2.67 0-8 1.34-8 4v2h8v-2c0-1.89 2.69-3.5 6-3.5H8z" />
          </svg>
        ),
      },
      {
        id: "/admin/calendar",
        label: "Calendar",
        icon: (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM5 20V9h14v11H5z" />
          </svg>
        ),
      },
      {
        id: "/admin/settings",
        label: "Settings",
        icon: (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M19.14 12.94a7.49 7.49 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.63l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.35 7.35 0 0 0-1.62-.94l-.36-2.54A.5.5 0 0 0 13.5 1h-3a.5.5 0 0 0-.49.42l-.36 2.54c-.59.23-1.14.54-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L1.71 8.85a.5.5 0 0 0 .12.63L3.86 11.1a7.49 7.49 0 0 0 0 1.88L1.83 14.56a.5.5 0 0 0-.12.63l1.92 3.32c.15.26.46.36.72.26l2.39-.96c.48.4 1.03.71 1.62.94l.36 2.54c.05.28.28.48.56.48h3c.28 0 .51-.2.56-.48l.36-2.54c.59-.23 1.14-.54 1.62-.94l2.39.96c.26.1.57 0 .72-.26l1.92-3.32a.5.5 0 0 0-.12-.63l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z" />
          </svg>
        ),
      },
      {
        id: "/admin/logout",
        label: "Sign out",
        icon: (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M16 13v-2H7V8l-5 4 5 4v-3zM20 3h-8v2h8v14h-8v2h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z" />
          </svg>
        ),
      },
    ],
    []
  );

  const [activeId, setActiveId] = useState<string>(defaultItems[0].id);
  const [collapsed, setCollapsed] = useState<boolean>(false);

  // Read persisted state on client only to avoid SSR hydration issues
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const rawActive = window.localStorage.getItem(STORAGE_KEY);
      if (rawActive) setActiveId(rawActive);
    } catch {
      // ignore read errors
    }
    try {
      if (typeof window === "undefined") return;
      const rawCollapsed = window.localStorage.getItem(COLLAPSE_KEY);
      setCollapsed(rawCollapsed === "true");
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(STORAGE_KEY, activeId);
    } catch {
      // ignore write errors
    }
  }, [activeId]);

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(COLLAPSE_KEY, collapsed ? "true" : "false");
    } catch {
      // ignore
    }
  }, [collapsed]);

  const handleNavigate = useCallback(
    (route: string) => {
      setActiveId(route);
      if (onNavigate) onNavigate(route);
    },
    [onNavigate]
  );

  const toggleCollapse = useCallback(() => setCollapsed((c) => !c), []);

  const containerStyle: React.CSSProperties = {
    width: collapsed ? 64 : 260,
    minWidth: collapsed ? 64 : 220,
    maxWidth: 320,
    height: "100vh",
    background: "var(--sidebar-bg, var(--surface, #fff))",
    color: "var(--sidebar-text, inherit)",
    borderRight: "1px solid rgba(0,0,0,0.06)",
    display: "flex",
    flexDirection: "column",
    transition: "width 180ms ease",
    boxSizing: "border-box",
    padding: "12px",
  };

  const headerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  };

  const brandStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minWidth: 0,
  };

  const brandTitleStyle: React.CSSProperties = {
    fontSize: 16,
    fontWeight: 700,
    lineHeight: 1,
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    overflow: "hidden",
  };

  const brandSubStyle: React.CSSProperties = {
    fontSize: 12,
    opacity: 0.75,
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    overflow: "hidden",
  };

  const navListStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginTop: 8,
    overflowY: "auto",
    paddingRight: 4,
  };

  const footerStyle: React.CSSProperties = {
    marginTop: "auto",
    display: "flex",
    gap: 8,
    alignItems: "center",
    justifyContent: collapsed ? "center" : "space-between",
    paddingTop: 8,
  };

  return (
    <aside role="navigation" aria-label="Admin sidebar" className="admin-sidebar" style={containerStyle}>
      <div style={headerStyle}>
        <div
          aria-hidden
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            background: "linear-gradient(135deg,#7c5cff,#00c2ff)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            flex: "0 0 40px",
          }}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
            <path d="M12 2L2 7v7c0 5 3.58 9.74 10 13 6.42-3.26 10-8 10-13V7l-10-5z" />
          </svg>
        </div>

        {!collapsed && (
          <div style={brandStyle}>
            <div style={brandTitleStyle}>Photobooth Admin</div>
            <div style={brandSubStyle}>Manage bookings & settings</div>
          </div>
        )}

        <div style={{ marginLeft: "auto" }}>
          <button
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={toggleCollapse}
            className="sidebar-collapse-toggle"
            style={{
              border: "none",
              background: "transparent",
              padding: 6,
              borderRadius: 6,
              cursor: "pointer",
              color: "inherit",
            }}
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
                <path d="M10 17l5-5-5-5v10z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
                <path d="M14 7l-5 5 5 5V7z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <nav aria-label="Primary" style={{ flex: "0 1 auto" }}>
        <div role="list" className="admin-nav-list" style={navListStyle}>
          {defaultItems.map((it) => (
            <div role="listitem" key={it.id}>
              <AdminNavItem
                id={it.id}
                label={it.label}
                icon={it.icon}
                active={activeId === it.id}
                onClick={() => handleNavigate(it.id)}
              />
            </div>
          ))}
        </div>
      </nav>

      <div style={footerStyle}>
        {!collapsed ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ fontSize: 13 }}>
              Signed in as
              <div style={{ fontWeight: 600, fontSize: 13 }}>Owner</div>
            </div>
          </div>
        ) : null}

        <div style={{ marginLeft: collapsed ? 0 : "auto" }}>
          <AdminNavItem
            id="/admin/profile"
            label={collapsed ? "Profile" : "Profile & account"}
            icon={
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
                <path d="M12 12a5 5 0 1 0-.001-10.001A5 5 0 0 0 12 12zm0 2c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5z" />
              </svg>
            }
            onClick={() => handleNavigate("/admin/profile")}
            active={activeId === "/admin/profile"}
          />
        </div>
      </div>
    </aside>
  );
}