const STORAGE_KEY = "photobooth_theme"; // values: "dark" | "light"

export type UseDarkModeReturn = {
  isDark: boolean;
  toggle: () => void;
  setDark: (value: boolean) => void;
};

function safeGetStoredTheme(): "dark" | "light" | null {
  try {
    if (typeof window === "undefined") return null;
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "dark" || v === "light") return v;
    return null;
  } catch {
    return null;
  }
}

function safeSetStoredTheme(value: "dark" | "light" | null): void {
  try {
    if (typeof window === "undefined") return;
    if (value === null) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, value);
    }
  } catch {
    // ignore (e.g. storage disabled)
  }
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

function applyDocumentTheme(isDark: boolean) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.classList.toggle("dark", isDark);
  el.setAttribute("data-theme", isDark ? "dark" : "light");
}

// Use layout effect on the client to avoid FOUC; fall back to effect on server
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function useDarkMode(): UseDarkModeReturn {
  // Read stored preference once (safe on server)
  const stored = safeGetStoredTheme();

  // Initialize state: stored value takes precedence, otherwise system preference
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (stored === "dark") return true;
    if (stored === "light") return false;
    return systemPrefersDark();
  });

  // Track whether user explicitly selected a theme (stored value exists)
  const isExplicitRef = useRef<boolean>(stored !== null);

  // Apply theme to document before paint on the client to prevent FOUC/hydration mismatch
  useIsomorphicLayoutEffect(() => {
    applyDocumentTheme(isDark);
  }, [isDark]);

  // Listen to system preference changes if user hasn't explicitly selected a theme
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

    const mql = window.matchMedia("(prefers-color-scheme: dark)");

    const mqlListener = (ev: MediaQueryListEvent | MediaQueryList) => {
      if (isExplicitRef.current) return;
      const matches = "matches" in ev ? ev.matches : (ev as MediaQueryList).matches;
      setIsDark(Boolean(matches));
    };

    // Prefer modern addEventListener API if available
    if (typeof mql.addEventListener === "function") {
      // cast is safe: event passed to listener will have .matches
      mql.addEventListener("change", mqlListener as EventListener);
    } else if (typeof (mql as any).addListener === "function") {
      // legacy API
      (mql as any).addListener(mqlListener);
    }

    return () => {
      try {
        if (typeof mql.removeEventListener === "function") {
          mql.removeEventListener("change", mqlListener as EventListener);
        } else if (typeof (mql as any).removeListener === "function") {
          (mql as any).removeListener(mqlListener);
        }
      } catch {
        // ignore cleanup errors
      }
    };
    // intentionally no deps: listener reads isExplicitRef.current
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cross-tab synchronization: update state when STORAGE_KEY changes in another tab/window
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;

      // newValue may be null (cleared) or "dark"/"light"
      const newVal = e.newValue;
      if (newVal === "dark") {
        isExplicitRef.current = true;
        setIsDark(true);
      } else if (newVal === "light") {
        isExplicitRef.current = true;
        setIsDark(false);
      } else {
        // cleared ? user preference removed -> follow system
        isExplicitRef.current = false;
        setIsDark(systemPrefersDark());
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setDark = useCallback((value: boolean) => {
    isExplicitRef.current = true;
    safeSetStoredTheme(value ? "dark" : "light");
    setIsDark(Boolean(value));
  }, []);

  const toggle = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      isExplicitRef.current = true;
      safeSetStoredTheme(next ? "dark" : "light");
      return next;
    });
  }, []);

  return { isDark, toggle, setDark };
}