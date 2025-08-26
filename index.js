async function initializeApp() {
  // Feature-detect localStorage; provide safe fallback
  const safeLocalStorage = (() => {
    try {
      const testKey = '__ls_test__';
      window.localStorage.setItem(testKey, testKey);
      window.localStorage.removeItem(testKey);
      return window.localStorage;
    } catch {
      let memoryStore = {};
      return {
        getItem: (k) => (k in memoryStore ? memoryStore[k] : null),
        setItem: (k, v) => {
          memoryStore[k] = String(v);
        },
        removeItem: (k) => {
          delete memoryStore[k];
        },
      };
    }
  })();

  // Enable JS flag for CSS
  try {
    document.documentElement.classList.add('js-enabled');
  } catch (e) {
    // ignore in non-DOM environments
  }

  // Apply theme from localStorage or system preference
  try {
    const stored = safeLocalStorage.getItem('theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = stored || (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
    // keep a copy in localStorage if missing
    if (!stored) safeLocalStorage.setItem('theme', theme);
  } catch (e) {
    // ignore
  }

  // Accessibility: only show focus outlines when tabbing
  try {
    const body = document.body;
    function handleFirstTab(e) {
      if (e.key === 'Tab') {
        body.classList.add('user-is-tabbing');
        window.removeEventListener('keydown', handleFirstTab);
        window.addEventListener('mousedown', handleMouseDownOnce);
        window.addEventListener('touchstart', handleMouseDownOnce);
      }
    }
    function handleMouseDownOnce() {
      body.classList.remove('user-is-tabbing');
      window.removeEventListener('mousedown', handleMouseDownOnce);
      window.removeEventListener('touchstart', handleMouseDownOnce);
      window.addEventListener('keydown', handleFirstTab);
    }
    window.addEventListener('keydown', handleFirstTab);
  } catch (e) {
    // ignore
  }

  // Global error handlers (non-intrusive)
  try {
    window.addEventListener('error', (ev) => {
      // Could forward to analytics in future
      // keep minimal to not break app
      // console.error('Global error captured', ev);
    });

    window.addEventListener('unhandledrejection', (ev) => {
      // console.warn('Unhandled promise rejection', ev);
    });
  } catch (e) {
    // ignore
  }

  // Wait for fonts if available so initial paint is smoother
  try {
    if (document.fonts && typeof document.fonts.ready?.then === 'function') {
      await document.fonts.ready;
    }
  } catch {
    // ignore
  }

  return;
}

let rootApi = null;
let rootContainer = null;

function getOrCreateRootEl(rootId = 'root') {
  if (typeof document === 'undefined') return null;
  let el = document.getElementById(rootId);
  if (!el) {
    el = document.createElement('div');
    el.id = rootId;
    document.body.appendChild(el);
  }
  return el;
}

function renderApp(RootComponent = App, rootEl) {
  if (!rootEl) return;
  // Unmount any previous rootApi if exists to avoid duplicate listeners in HMR scenarios
  try {
    if (!rootApi || rootContainer !== rootEl) {
      rootApi = createRoot(rootEl);
      rootContainer = rootEl;
    }
    rootApi.render(
      React.createElement(React.StrictMode, null, React.createElement(RootComponent))
    );
  } catch (err) {
    // If createRoot fails for any reason, fallback to hydrateRoot/render via legacy approach is out of scope.
    // Log and rethrow for visibility during development.
    // eslint-disable-next-line no-console
    console.error('Failed to mount app', err);
    throw err;
  }
}

export function mount(rootId = 'root') {
  // mount is for client-only render
  initializeApp()
    .then(() => {
      const rootEl = getOrCreateRootEl(rootId);
      if (!rootEl) return;
      renderApp(App, rootEl);

      // Hot Module Replacement: re-require App module when it changes
      if (module && module.hot && typeof module.hot.accept === 'function') {
        module.hot.accept('./App', () => {
          try {
            // eslint-disable-next-line global-require
            const NextApp = require('./App').default;
            renderApp(NextApp, rootEl);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error('HMR reload failed', e);
          }
        });
      }
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('initializeApp failed', err);
    });
}

export function hydrate(rootId = 'root') {
  // hydrate is for SSR hydration when server-rendered HTML is present
  initializeApp()
    .then(() => {
      const rootEl = getOrCreateRootEl(rootId);
      if (!rootEl) return;

      try {
        // If there is server-rendered content, use hydrateRoot; otherwise fall back to createRoot.render
        const hasServerRendered = rootEl.hasChildNodes();
        if (hasServerRendered) {
          // hydrateRoot replaces previous rootApi notion; we still keep a reference for HMR convenience
          rootApi = {
            render: (node) => {
              // hydrateRoot returns an object but we only need to call render via it
              hydrateRoot(rootEl, node);
            },
          };
          rootApi.render(
            React.createElement(React.StrictMode, null, React.createElement(App))
          );
        } else {
          renderApp(App, rootEl);
        }

        // HMR support for hydrate as well
        if (module && module.hot && typeof module.hot.accept === 'function') {
          module.hot.accept('./App', () => {
            try {
              // eslint-disable-next-line global-require
              const NextApp = require('./App').default;
              if (rootApi && rootApi.render) {
                rootApi.render(
                  React.createElement(React.StrictMode, null, React.createElement(NextApp))
                );
              } else {
                renderApp(NextApp, rootEl);
              }
            } catch (e) {
              // eslint-disable-next-line no-console
              console.error('HMR reload failed', e);
            }
          });
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Hydration failed, falling back to client render', err);
        renderApp(App, rootEl);
      }
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('initializeApp failed', err);
    });
}

export default {
  initializeApp,
  mount,
  hydrate,
};