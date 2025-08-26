const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
};

declare global {
  interface Window {
    __PHOTOBOOTH_APP_BOOTSTRAPPED__?: boolean;
    __PHOTOBOOTH_APP_SERVICES_REGISTERED__?: boolean;
  }
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
    this.handleReload = this.handleReload.bind(this);
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    try {
      const payload = {
        message: error.message,
        stack: error.stack,
        info,
        time: new Date().toISOString(),
      };
      localStorage.setItem('photobooth.lastError', JSON.stringify(payload));
    } catch {
      // ignore storage errors
    }
    // eslint-disable-next-line no-console
    console.error('Uncaught error in React tree', error, info);
  }

  handleReload() {
    window.location.reload();
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            boxSizing: 'border-box',
            textAlign: 'center',
            background: 'var(--bg, #fff)',
            color: 'var(--text, #000)',
          }}
        >
          <div>
            <h1>Something went wrong</h1>
            <p>An unexpected error occurred. You can try reloading the app.</p>
            <div style={{ marginTop: 12 }}>
              <button onClick={this.handleReload} style={{ padding: '8px 16px' }}>
                Reload
              </button>
            </div>
            <details style={{ marginTop: 12, textAlign: 'left' }}>
              <summary>Details</summary>
              <pre style={{ whiteSpace: 'pre-wrap', maxWidth: 520, overflow: 'auto' }}>
                {this.state.error?.message}
                {'\n'}
                {this.state.error?.stack}
              </pre>
            </details>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const SERVICES_FLAG = '__PHOTOBOOTH_APP_SERVICES_REGISTERED__';

let mqlRef: MediaQueryList | null = null;
let mqlHandlerRef: ((e: MediaQueryListEvent) => void) | null = null;
let errorHandlerRef: ((ev: ErrorEvent) => void) | null = null;
let unhandledRejectionHandlerRef: ((ev: PromiseRejectionEvent) => void) | null = null;

async function registerAppServices(): Promise<void> {
  // Avoid duplicate registration across HMR or multiple invocations
  try {
    if (typeof window !== 'undefined' && (window as any)[SERVICES_FLAG]) {
      return;
    }
  } catch {
    // ignore
  }

  // Initialize persisted settings if not present
  try {
    const raw = localStorage.getItem('photobooth.settings');
    if (!raw) {
      localStorage.setItem('photobooth.settings', JSON.stringify(DEFAULT_SETTINGS));
    } else {
      const parsed = JSON.parse(raw) as Partial<AppSettings> | null;
      if (!parsed || !('theme' in parsed)) {
        const merged = { ...DEFAULT_SETTINGS, ...(parsed || {}) };
        localStorage.setItem('photobooth.settings', JSON.stringify(merged));
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Could not read/write photobooth.settings in localStorage', e);
  }

  // Apply theme (light/dark/system)
  try {
    const settingsRaw = localStorage.getItem('photobooth.settings');
    const settings = settingsRaw ? (JSON.parse(settingsRaw) as AppSettings) : DEFAULT_SETTINGS;
    const theme = settings.theme || 'system';

    const applyTheme = (t: AppSettings['theme']) => {
      const el = document.documentElement;
      if (t === 'system') {
        const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        el.dataset.theme = isDark ? 'dark' : 'light';
      } else {
        el.dataset.theme = t;
      }
      const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
      if (meta) {
        // Try to read CSS variables; if not present yet, we'll schedule an update on window.load
        try {
          const varName = el.dataset.theme === 'dark' ? '--theme-color-dark' : '--theme-color-light';
          const computed = getComputedStyle(document.documentElement).getPropertyValue(varName);
          const color = computed?.trim() || (el.dataset.theme === 'dark' ? '#111' : '#fff');
          meta.setAttribute('content', color);
        } catch {
          // ignore computed style errors
        }
      }
    };

    applyTheme(theme);

    // Re-apply theme once resources/styles have loaded to ensure CSS variables are available
    const onLoadUpdate = () => applyTheme(theme);
    if (document.readyState === 'complete') {
      // already loaded
      applyTheme(theme);
    } else {
      window.addEventListener('load', onLoadUpdate, { once: true });
    }

    // react to system theme changes when using 'system'
    if (theme === 'system' && window.matchMedia) {
      try {
        const mql = window.matchMedia('(prefers-color-scheme: dark)');
        mqlRef = mql;
        mqlHandlerRef = (e: MediaQueryListEvent) => {
          document.documentElement.dataset.theme = e.matches ? 'dark' : 'light';
          // update meta on change
          const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
          if (meta) {
            try {
              const varName = document.documentElement.dataset.theme === 'dark' ? '--theme-color-dark' : '--theme-color-light';
              const computed = getComputedStyle(document.documentElement).getPropertyValue(varName);
              const color = computed?.trim() || (document.documentElement.dataset.theme === 'dark' ? '#111' : '#fff');
              meta.setAttribute('content', color);
            } catch {
              // ignore
            }
          }
        };

        if (typeof mql.addEventListener === 'function') {
          mql.addEventListener('change', mqlHandlerRef);
        } else if (typeof mql.addListener === 'function') {
          // @ts-expect-error legacy
          mql.addListener(mqlHandlerRef);
        }
      } catch {
        // ignore matchMedia errors
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Could not apply theme', e);
  }

  // Global error handlers
  try {
    errorHandlerRef = (ev: ErrorEvent) => {
      try {
        const payload = {
          message: ev.message,
          filename: ev.filename || '',
          lineno: ev.lineno || 0,
          colno: ev.colno || 0,
          error: ev.error ? { message: (ev.error as Error).message, stack: (ev.error as Error).stack } : undefined,
          time: new Date().toISOString(),
        };
        localStorage.setItem('photobooth.lastError', JSON.stringify(payload));
      } catch {
        // ignore
      }
      // eslint-disable-next-line no-console
      console.error('Window error', ev);
    };

    unhandledRejectionHandlerRef = (ev: PromiseRejectionEvent) => {
      try {
        const reason: any = ev.reason;
        const payload = {
          message: reason?.message ?? String(reason),
          stack: reason?.stack,
          time: new Date().toISOString(),
        };
        localStorage.setItem('photobooth.lastUnhandledRejection', JSON.stringify(payload));
      } catch {
        // ignore
      }
      // eslint-disable-next-line no-console
      console.error('Unhandled rejection', ev);
    };

    window.addEventListener('error', errorHandlerRef);
    window.addEventListener('unhandledrejection', unhandledRejectionHandlerRef);
  } catch {
    // noop
  }

  // Service worker registration (optional): only register in production and if available
  try {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          // eslint-disable-next-line no-console
          console.info('Service worker registered', reg);
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.warn('Service worker registration failed', err);
        });
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Service worker registration error', e);
  }

  // Warm up fonts (if available)
  try {
    if (document && (document as any).fonts && (document as any).fonts.ready) {
      await (document as any).fonts.ready;
    }
  } catch {
    // ignore
  }

  // Mark services registered to prevent duplicate registrations (persist across HMR)
  try {
    (window as any)[SERVICES_FLAG] = true;
    window.__PHOTOBOOTH_APP_SERVICES_REGISTERED__ = true;
  } catch {
    // ignore
  }
}

async function bootstrap(): Promise<void> {
  try {
    await registerAppServices();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Bootstrap failed', e);
  }
}

let rootInstance: Root | null = null;

function renderRoot(): void {
  const id = 'root';
  let container = document.getElementById(id);
  if (!container) {
    container = document.createElement('div');
    container.id = id;
    document.body.appendChild(container);
  }

  if (rootInstance) {
    try {
      rootInstance.unmount();
      rootInstance = null;
    } catch {
      // ignore
    }
  }

  rootInstance = createRoot(container);
  rootInstance.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}

async function startApp() {
  try {
    if (document.readyState === 'loading') {
      await new Promise<void>((resolve) => {
        document.addEventListener(
          'DOMContentLoaded',
          () => resolve(),
          { once: true }
        );
      });
    }

    await bootstrap();
    renderRoot();

    try {
      window.__PHOTOBOOTH_APP_BOOTSTRAPPED__ = true;
    } catch {
      // ignore
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Failed to start app', e);
    try {
      renderRoot();
    } catch {
      // nothing we can do
    }
  }
}

startApp();

// Cleanup helpers for environments that hot-reload modules
// Useful during development to remove listeners when module is torn down
export function __cleanupAppForHMR() {
  try {
    if (errorHandlerRef) {
      window.removeEventListener('error', errorHandlerRef);
      errorHandlerRef = null;
    }
    if (unhandledRejectionHandlerRef) {
      window.removeEventListener('unhandledrejection', unhandledRejectionHandlerRef);
      unhandledRejectionHandlerRef = null;
    }
    if (mqlRef && mqlHandlerRef) {
      if (typeof mqlRef.removeEventListener === 'function') {
        mqlRef.removeEventListener('change', mqlHandlerRef);
      } else if (typeof mqlRef.removeListener === 'function') {
        // @ts-expect-error legacy
        mqlRef.removeListener(mqlHandlerRef);
      }
      mqlRef = null;
      mqlHandlerRef = null;
    }
  } catch {
    // ignore
  }
}