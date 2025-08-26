const STORAGE_KEYS = {
  userCandidates: [
    "photobooth_user",
    "user",
    "auth",
    "currentUser",
    "photobooth_auth",
  ],
  adminPin: "photobooth_admin_pin",
  adminValidatedAt: "photobooth_admin_validated_at",
  adminPinAttempts: "photobooth_admin_pin_attempts",
};

function safeGetItem(key: string): string | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore write errors (quota/privacy mode)
  }
}

function safeRemoveItem(key: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function isUserRecord(obj: any): obj is UserRecord {
  if (!obj || typeof obj !== "object") return false;
  if ("id" in obj && (typeof obj.id === "string" || typeof obj.id === "number"))
    return true;
  if ("email" in obj && typeof obj.email === "string") return true;
  if ("role" in obj && typeof obj.role === "string") return true;
  if ("isAdmin" in obj && typeof obj.isAdmin === "boolean") return true;
  return false;
}

/**
 * Read user record from localStorage in a robust, SSR-safe way.
 * - Guards window/localStorage access
 * - Tries to JSON.parse each candidate; if parsed object matches shape, return it
 * - Collects non-JSON/raw string candidates and only if no structured object is found
 *   will it return a minimal record using the first raw candidate
 */
export function readUserFromStorage(): UserRecord | null {
  if (typeof window === "undefined") return null;

  const rawStringCandidates: string[] = [];

  for (const key of STORAGE_KEYS.userCandidates) {
    const raw = safeGetItem(key);
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      if (isUserRecord(parsed)) return parsed;
      // If parsed but doesn't match expected shape, continue to next candidate
    } catch {
      // not JSON ? collect raw string candidate and continue checking other keys
      rawStringCandidates.push(raw);
    }
  }

  if (rawStringCandidates.length > 0) {
    // If no structured user was found, treat the first raw candidate as a minimal user id
    return { id: rawStringCandidates[0] } as UserRecord;
  }

  return null;
}

export function isAuthenticated(): boolean {
  return !!readUserFromStorage();
}

export function isUserAdmin(user: UserRecord | null): boolean {
  if (!user) return false;
  if (user.isAdmin === true) return true;
  if (typeof user.role === "string" && user.role.toLowerCase() === "admin")
    return true;
  return false;
}

/**
 * Verify an admin PIN stored in localStorage in an SSR-safe manner.
 * Note: client-only PINs are inherently limited in security. Prefer a backend-verified flow.
 */
export async function requireAdminPin(pin: string): Promise<boolean> {
  // Simulate async I/O
  await new Promise((r) => setTimeout(r, 150));

  if (typeof window === "undefined") return false;

  const storedPin = safeGetItem(STORAGE_KEYS.adminPin);
  const attemptsRaw = safeGetItem(STORAGE_KEYS.adminPinAttempts);

  let attempts: { count: number; lastAttemptTs: number } = {
    count: 0,
    lastAttemptTs: 0,
  };
  if (attemptsRaw) {
    try {
      const parsed = JSON.parse(attemptsRaw);
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof parsed.count === "number" &&
        typeof parsed.lastAttemptTs === "number"
      ) {
        attempts = parsed;
      }
    } catch {
      attempts = { count: 0, lastAttemptTs: 0 };
    }
  }

  const now = Date.now();
  const ATTEMPT_LIMIT = 5;
  const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

  if (attempts.count >= ATTEMPT_LIMIT && now - attempts.lastAttemptTs < COOLDOWN_MS) {
    return false;
  }

  if (!storedPin) {
    return false;
  }

  const ok = storedPin === pin;

  if (ok) {
    safeRemoveItem(STORAGE_KEYS.adminPinAttempts);
    safeSetItem(STORAGE_KEYS.adminValidatedAt, String(Date.now()));
    return true;
  } else {
    const newAttempts = {
      count: (attempts.count || 0) + 1,
      lastAttemptTs: now,
    };
    try {
      safeSetItem(STORAGE_KEYS.adminPinAttempts, JSON.stringify(newAttempts));
    } catch {
      // ignore
    }
    return false;
  }
}

export default function ProtectedRoute(props: ProtectedRouteProps): JSX.Element {
  const {
    children,
    requireAdmin = false,
    redirectTo = "/login",
    adminVerifyPath = "/admin/verify",
    adminValidationGraceMs = 5 * 60 * 1000, // 5 minutes default
  } = props;

  const location = useLocation();
  const [loading, setLoading] = useState<boolean>(true);
  const [user, setUser] = useState<UserRecord | null>(null);
  const [validatedAt, setValidatedAt] = useState<number>(0);

  useEffect(() => {
    let mounted = true;

    function refreshFromStorage() {
      if (!mounted) return;
      const u = readUserFromStorage();
      setUser(u);

      // Read adminValidatedAt safely
      const validatedRaw = safeGetItem(STORAGE_KEYS.adminValidatedAt);
      let v = 0;
      if (validatedRaw) {
        const n = Number(validatedRaw);
        if (!Number.isNaN(n)) v = n;
      }
      setValidatedAt(v);

      setLoading(false);
    }

    // Initial load
    refreshFromStorage();

    // Listen for cross-tab storage changes so auth status stays in sync
    function onStorage(e: StorageEvent) {
      if (!e.key) {
        // full clear; just refresh
        refreshFromStorage();
        return;
      }
      const interestingKeys = new Set([
        ...STORAGE_KEYS.userCandidates,
        STORAGE_KEYS.adminValidatedAt,
        STORAGE_KEYS.adminPin,
        STORAGE_KEYS.adminPinAttempts,
      ]);
      if (interestingKeys.has(e.key)) {
        refreshFromStorage();
      }
    }

    if (typeof window !== "undefined") {
      window.addEventListener("storage", onStorage);
    }

    return () => {
      mounted = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("storage", onStorage);
      }
    };
    // Intentionally not depending on location to avoid unnecessary re-reads on route change
    // The storage listener will pick up changes from other tabs.
  }, []);

  if (loading) {
    // While we don't know auth state (client hydration), avoid redirecting during SSR/hydration.
    // Rendering nothing prevents UI flash. Parent routes/pages can show their own loaders.
    return <></>;
  }

  const authed = !!user;

  if (!authed) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  if (requireAdmin) {
    const admin = isUserAdmin(user);

    if (!admin) {
      return <Navigate to={redirectTo} state={{ from: location }} replace />;
    }

    const now = Date.now();
    if (now - validatedAt > adminValidationGraceMs) {
      return (
        <Navigate to={adminVerifyPath} state={{ from: location }} replace />
      );
    }
  }

  return <>{children}</>;
}