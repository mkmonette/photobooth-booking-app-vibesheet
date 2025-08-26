const STORAGE_KEY = 'photobooth:theme';
const DATA_THEME_ATTR = 'data-theme';
const BODY_KEYBOARD_CLASS = 'user-is-tabbing';

let isInitialized = false;
let cleanupTasks: Array<() => void> = [];
let mediaQueryList: MediaQueryList | null = null;

function safeLocalStorageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore write errors (e.g., storage disabled)
  }
}

function getSystemPreferredTheme(): 'light' | 'dark' {
  try {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    return mql.matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function applyThemeToDocument(themeToApply: 'light' | 'dark') {
  const docEl = document.documentElement;
  if (!docEl) return;
  docEl.setAttribute(DATA_THEME_ATTR, themeToApply);
  // also keep a class on body for legacy selectors
  if (document.body) {
    document.body.classList.remove('theme-light', 'theme-dark');
    document.body.classList.add(`theme-${themeToApply}`);
  }
  window.dispatchEvent(
    new CustomEvent<ThemeChangeDetail>('app:themechange', {
      detail: { theme: getTheme(), applied: themeToApply },
    })
  );
}

function getTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  const stored = safeLocalStorageGet(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'system';
}

function resolveAppliedTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return getSystemPreferredTheme();
  }
  return theme;
}

function applyTheme(theme?: Theme) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const resolved = resolveAppliedTheme(theme ?? getTheme());
  applyThemeToDocument(resolved);
}

function setTheme(theme: Theme) {
  if (typeof window === 'undefined') return;
  safeLocalStorageSet(STORAGE_KEY, theme);
  applyTheme(theme);
}

function toggleTheme(): Theme {
  const current = getTheme();
  let next: Theme;
  if (current === 'light') next = 'dark';
  else if (current === 'dark') next = 'system';
  else next = 'light';
  setTheme(next);
  return next;
}

function handleGlobalError(ev: ErrorEvent | PromiseRejectionEvent) {
  try {
    const detail = {
      message:
        ev instanceof ErrorEvent
          ? ev.message
          : ev instanceof PromiseRejectionEvent
          ? (ev.reason && String(ev.reason)) || 'Unhandled rejection'
          : 'Unknown error',
      source: ev instanceof ErrorEvent ? ev.filename : undefined,
      lineno: ev instanceof ErrorEvent ? ev.lineno : undefined,
      colno: ev instanceof ErrorEvent ? ev.colno : undefined,
      error: ev instanceof ErrorEvent ? ev.error : ev instanceof PromiseRejectionEvent ? ev.reason : undefined,
      originalEvent: ev,
    };
    // console for developers
    // eslint-disable-next-line no-console
    console.error('App global error', detail);
    window.dispatchEvent(new CustomEvent('app:error', { detail }));
  } catch {
    // swallowing to avoid infinite loops in error handlers
  }
}

function addMediaQueryListener(mql: MediaQueryList, cb: (ev: MediaQueryListEvent | MediaQueryList) => void) {
  // modern API
  if ('addEventListener' in mql) {
    const listener = (ev: MediaQueryListEvent) => cb(ev);
    mql.addEventListener('change', listener);
    cleanupTasks.push(() => mql.removeEventListener('change', listener));
  } else if ('addListener' in mql) {
    // older browsers
    const listener = (ev: MediaQueryListEvent) => cb(ev);
    // @ts-ignore - legacy API
    mql.addListener(listener);
    // @ts-ignore
    cleanupTasks.push(() => mql.removeListener(listener));
  }
}

export function setupGlobals(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (isInitialized) return;
  isInitialized = true;

  // keyboard focus ring management: add class when user tabs, remove on mouse interaction
  const handleFirstTab = (e: KeyboardEvent) => {
    if (e.key === 'Tab' || e.keyCode === 9) {
      document.body?.classList.add(BODY_KEYBOARD_CLASS);
      window.removeEventListener('keydown', handleFirstTab, true);
      // add mouse listener to remove the class when user uses mouse
      const handleMouseDown = () => {
        document.body?.classList.remove(BODY_KEYBOARD_CLASS);
        // re-add the tab listener to re-enable keyboard outlines later
        window.addEventListener('keydown', handleFirstTab, true);
        window.removeEventListener('mousedown', handleMouseDown, true);
      };
      window.addEventListener('mousedown', handleMouseDown, true);
      cleanupTasks.push(() => window.removeEventListener('mousedown', handleMouseDown, true));
    }
  };
  window.addEventListener('keydown', handleFirstTab, true);
  cleanupTasks.push(() => window.removeEventListener('keydown', handleFirstTab, true));

  // global key shortcuts
  const keydownHandler = (e: KeyboardEvent) => {
    // escape: broadcast app:escape
    if (e.key === 'Escape' || e.key === 'Esc') {
      window.dispatchEvent(new CustomEvent('app:escape'));
    }
    // simple theme toggle for devs/users: 't' key with modifier keys not pressed
    if ((e.key === 't' || e.key === 'T') && !e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      toggleTheme();
    }
  };
  window.addEventListener('keydown', keydownHandler);
  cleanupTasks.push(() => window.removeEventListener('keydown', keydownHandler));

  // global error handlers
  const errorHandler = (ev: ErrorEvent) => handleGlobalError(ev);
  const rejectionHandler = (ev: PromiseRejectionEvent) => handleGlobalError(ev);
  window.addEventListener('error', errorHandler);
  window.addEventListener('unhandledrejection', rejectionHandler);
  cleanupTasks.push(() => window.removeEventListener('error', errorHandler));
  cleanupTasks.push(() => window.removeEventListener('unhandledrejection', rejectionHandler));

  // theme management: apply on startup and listen to system preference changes
  applyTheme(); // initial apply based on saved setting or system

  try {
    mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
    if (mediaQueryList) {
      const mediaChangeCb = (ev: MediaQueryListEvent | MediaQueryList) => {
        // only change applied theme when user has chosen 'system'
        if (getTheme() === 'system') {
          applyTheme();
        }
      };
      addMediaQueryListener(mediaQueryList, mediaChangeCb);
    }
  } catch {
    mediaQueryList = null;
  }

  // attach a minimal global helper object for app-level utilities
  const globals: PhotoBoothGlobals = {
    getTheme,
    setTheme,
    toggleTheme,
    applyTheme,
    isSetup: true,
    teardown: teardownGlobals,
  };

  window.__PHOTOBOOTH_GLOBALS__ = globals;

  // signal ready
  window.dispatchEvent(new CustomEvent('app:globalsready', { detail: { timestamp: Date.now() } }));
}

export function teardownGlobals(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!isInitialized) return;

  // run cleanup tasks in reverse order to mimic stack unwind semantics
  while (cleanupTasks.length) {
    try {
      const task = cleanupTasks.pop();
      task && task();
    } catch {
      // swallow errors during teardown
    }
  }

  // remove theme attributes/classes we applied
  try {
    const docEl = document.documentElement;
    if (docEl && docEl.hasAttribute(DATA_THEME_ATTR)) {
      docEl.removeAttribute(DATA_THEME_ATTR);
    }
    if (document.body) {
      document.body.classList.remove('theme-light', 'theme-dark', BODY_KEYBOARD_CLASS);
    }
  } catch {
    // ignore
  }

  // remove media query listener reference
  mediaQueryList = null;

  // remove global reference
  try {
    if (window.__PHOTOBOOTH_GLOBALS__) {
      delete window.__PHOTOBOOTH_GLOBALS__;
    }
  } catch {
    // ignore
  }

  isInitialized = false;

  // signal teardown
  try {
    window.dispatchEvent(new CustomEvent('app:globalsteardown', { detail: { timestamp: Date.now() } }));
  } catch {
    // ignore
  }
}