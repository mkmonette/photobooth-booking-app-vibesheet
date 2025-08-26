const HomePage = lazy(() => import("./pages/Home"));
const BookingPage = lazy(() => import("./pages/Booking"));
const LoginPage = lazy(() => import("./pages/Login"));
const SignupPage = lazy(() => import("./pages/Signup"));
const DashboardPage = lazy(() => import("./pages/Dashboard"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const AdminPage = lazy(() => import("./pages/Admin"));
const NotFoundPage = lazy(() => import("./pages/NotFound"));
const UnauthorizedPage = lazy(() => import("./pages/Unauthorized"));

/**
 * Lightweight auth helpers reading from localStorage.
 * Keys and shape are intentionally generic; adjust to your app's auth storage.
 *
 * These helpers guard access to window/localStorage so they won't throw during SSR.
 */
function getStoredUser(): { [k: string]: any } | null {
  try {
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
      return null;
    }

    const raw =
      window.localStorage.getItem("photobooth_user") ||
      window.localStorage.getItem("user");
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Determine authentication in a client-safe way.
 * - Returns false during SSR (no window).
 * - If a user object contains an expiresAt field (seconds or ms), validate it.
 * Note: This is a best-effort client-side check. Server-side validation/refresh is recommended.
 */
function isAuthenticated(): boolean {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return false;
  }

  const user = getStoredUser();
  if (!user) return false;

  const expiresAt = user?.expiresAt;
  if (typeof expiresAt === "number") {
    // Support both seconds and milliseconds timestamps
    const now = Date.now();
    const expiresMs = expiresAt > 1e12 ? expiresAt : expiresAt * 1000;
    return now < expiresMs;
  }

  return true;
}

/**
 * RequireAuth wrapper component. If not authenticated, redirects to /login.
 * If roles are provided, also checks user role and redirects to /unauthorized if mismatch.
 */
function RequireAuth({
  children,
  roles,
}: {
  children: ReactNode;
  roles?: string[];
}): JSX.Element {
  const location = useLocation();

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (roles && roles.length > 0) {
    const user = getStoredUser();
    const role = user?.role;
    if (!role || !roles.includes(role)) {
      return <Navigate to="/unauthorized" replace state={{ from: location }} />;
    }
  }

  return <>{children}</>;
}

/**
 * Prevents authenticated users from accessing public-only pages like login/signup.
 * If authed, redirect to dashboard (or another sensible default).
 */
function RedirectIfAuthenticated({ children }: { children: ReactNode }): JSX.Element {
  const location = useLocation();

  if (isAuthenticated()) {
    return <Navigate to="/dashboard" replace state={{ from: location }} />;
  }
  return <>{children}</>;
}

/**
 * Returns application route configuration.
 * Keep this pure so it can be used in tests or elsewhere.
 */
export function createRouteConfig(): RouteConfig[] {
  return [
    {
      path: "/",
      element: <HomePage />,
    },
    {
      path: "/booking",
      element: <BookingPage />,
    },
    {
      path: "/login",
      element: <LoginPage />,
      publicOnly: true,
    },
    {
      path: "/signup",
      element: <SignupPage />,
      publicOnly: true,
    },
    {
      path: "/dashboard",
      element: <DashboardPage />,
      protected: true,
      children: [
        {
          path: "settings",
          element: <SettingsPage />,
          protected: true,
        },
      ],
    },
    {
      path: "/admin",
      element: <AdminPage />,
      protected: true,
      roles: ["admin"],
    },
    {
      path: "/unauthorized",
      element: <UnauthorizedPage />,
    },
    {
      path: "*",
      element: <NotFoundPage />,
    },
  ];
}

/**
 * Wraps a route's element with protection wrappers based on route config.
 * Returns a JSX element ready to be rendered inside a <Route>.
 */
export function protectedRouteWrapper(route: RouteConfig): ReactNode {
  let element = route.element;

  if (route.protected) {
    element = <RequireAuth roles={route.roles}>{element}</RequireAuth>;
  } else if (route.publicOnly) {
    element = <RedirectIfAuthenticated>{element}</RedirectIfAuthenticated>;
  }

  return element;
}

/**
 * Routes component that renders app routes.
 * Uses BrowserRouter internally for simplicity ? if you already provide a Router
 * at a higher level, you can replace/adjust this component accordingly.
 */
export default function Routes(): JSX.Element {
  const routeConfig = createRouteConfig();

  const renderRoute = (r: RouteConfig) => {
    const wrapped = protectedRouteWrapper(r);
    if (r.children && r.children.length > 0) {
      return (
        <Route
          key={r.path}
          path={r.path}
          element={
            <Suspense fallback={<div aria-busy="true">Loading?</div>}>
              {wrapped}
            </Suspense>
          }
          caseSensitive={!!r.caseSensitive}
        >
          {r.children.map((child) => {
            const childWrapped = protectedRouteWrapper(child);
            return (
              <Route
                key={`${r.path}:${child.path}`}
                path={child.path}
                element={
                  <Suspense fallback={<div aria-busy="true">Loading?</div>}>
                    {childWrapped}
                  </Suspense>
                }
                caseSensitive={!!child.caseSensitive}
              />
            );
          })}
        </Route>
      );
    }

    return (
      <Route
        key={r.path}
        path={r.path}
        element={
          <Suspense fallback={<div aria-busy="true">Loading?</div>}>
            {wrapped}
          </Suspense>
        }
        caseSensitive={!!r.caseSensitive}
      />
    );
  };

  return (
    <BrowserRouter>
      <RRDRoutes>{routeConfig.map((r) => renderRoute(r))}</RRDRoutes>
    </BrowserRouter>
  );
}