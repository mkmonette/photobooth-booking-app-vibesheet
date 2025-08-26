export function isServiceWorkerSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }

  // Basic feature detection
  if (!('serviceWorker' in navigator)) {
    return false;
  }

  // Ensure secure context or localhost allowances for development
  // window.isSecureContext is true for https and some localhost contexts in modern browsers
  const { location } = window;
  const isLocalhost =
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.hostname === '::1';

  return Boolean(window.isSecureContext || location.protocol === 'https:' || isLocalhost);
}

export interface ServiceWorkerRegisterOptions {
  /**
   * Called whenever an updatefound event fires on the registration.
   * Receives the ServiceWorkerRegistration.
   */
  onUpdateFound?: (registration: ServiceWorkerRegistration) => void;

  /**
   * Called when a service worker reaches the 'installed' state.
   * The second argument is true when this is an update (there was an active controller before install),
   * false when it's the first install.
   */
  onInstalled?: (registration: ServiceWorkerRegistration, isUpdate: boolean) => void;

  /**
   * Called when a service worker reaches the 'activated' state.
   */
  onActivated?: (registration: ServiceWorkerRegistration) => void;

  /**
   * Called on any state change of an installing service worker.
   */
  onStateChange?: (worker: ServiceWorker, state: ServiceWorkerState) => void;

  /**
   * Optional logger for errors and diagnostic messages. Defaults to console.error/console.info.
   */
  logger?: {
    error?: (err: unknown) => void;
    info?: (...args: unknown[]) => void;
    debug?: (...args: unknown[]) => void;
  };
}

/**
 * Register a service worker.
 * @param scriptUrl Optional path to service worker script. Defaults to '/service-worker.js'.
 * @param options Optional callbacks and logger to observe lifecycle and errors.
 * @returns The ServiceWorkerRegistration if successful, otherwise null.
 */
export async function registerServiceWorker(
  scriptUrl?: string,
  options?: ServiceWorkerRegisterOptions
): Promise<ServiceWorkerRegistration | null> {
  const logger = {
    error: options?.logger?.error ?? ((err: unknown) => console.error('[SW] error:', err)),
    info: options?.logger?.info ?? ((...args: unknown[]) => console.info('[SW]', ...args)),
    debug: options?.logger?.debug ?? ((...args: unknown[]) => console.debug('[SW]', ...args)),
  };

  if (!isServiceWorkerSupported()) {
    logger.debug('Service workers are not supported in this environment.');
    return null;
  }

  const rawUrl = scriptUrl && typeof scriptUrl === 'string' ? scriptUrl : '/service-worker.js';

  // Resolve and validate URL to ensure same-origin (avoid confusing cross-origin failures).
  let swUrl: string;
  try {
    const resolved = new URL(rawUrl, window.location.href);
    if (resolved.origin !== window.location.origin) {
      logger.error(
        new Error(
          `Service worker script must be same-origin. Provided: ${resolved.href} (origin ${resolved.origin})`
        )
      );
      return null;
    }
    // Use pathname + search + hash to preserve relative resolution but keep origin check
    swUrl = resolved.href;
  } catch (err) {
    logger.error(new Error(`Invalid service worker script URL: ${String(rawUrl)}`));
    logger.error(err);
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register(swUrl);
    logger.info('Service worker registered:', swUrl);

    // Helper to attach statechange handlers for a given worker
    const attachStateHandlers = (sw: ServiceWorker | null) => {
      if (!sw) return;
      const handle = () => {
        try {
          const state = sw.state as ServiceWorkerState;
          options?.onStateChange?.(sw, state);
          // When installed: if there's a controller, it's an update; otherwise first install
          if (state === 'installed') {
            const isUpdate = Boolean(navigator.serviceWorker.controller);
            try {
              options?.onInstalled?.(registration, isUpdate);
            } catch (cbErr) {
              logger.error(cbErr);
            }
          }
          if (state === 'activated') {
            try {
              options?.onActivated?.(registration);
            } catch (cbErr) {
              logger.error(cbErr);
            }
          }
        } catch (err) {
          logger.error(err);
        }
      };

      // Use addEventListener rather than onstatechange to avoid overwriting potential other handlers
      try {
        sw.addEventListener('statechange', handle);
      } catch (err) {
        // Fallback if addEventListener is not available for some reason
        // @ts-ignore
        if (typeof sw.onstatechange === 'function') {
          // @ts-ignore
          sw.onstatechange = handle;
        } else {
          logger.debug('Unable to attach statechange handler to service worker:', err);
        }
      }
    };

    // If an installing worker is present now, observe it.
    if (registration.installing) {
      logger.debug('Service worker installing detected.');
      attachStateHandlers(registration.installing);
    }

    // If there's a waiting worker, it's ready to take over when skipWaiting is called or the page is reloaded.
    if (registration.waiting) {
      logger.debug('Service worker waiting (update ready).');
      // Treat waiting as "installed" for update experience
      try {
        options?.onUpdateFound?.(registration);
        // call onInstalled with isUpdate = true because waiting implies an update
        options?.onInstalled?.(registration, true);
      } catch (cbErr) {
        logger.error(cbErr);
      }
    }

    // If an active worker controls the page already
    if (registration.active) {
      logger.debug('Service worker active and controlling the page.');
    }

    // Observe future updatefound events
    registration.addEventListener('updatefound', () => {
      logger.info('Service worker updatefound event.');
      try {
        options?.onUpdateFound?.(registration);
      } catch (cbErr) {
        logger.error(cbErr);
      }

      const newWorker = registration.installing;
      attachStateHandlers(newWorker);
    });

    return registration;
  } catch (err) {
    logger.error(new Error('Service worker registration failed.'));
    logger.error(err);
    return null;
  }
}

/**
 * Unregister all service workers for this origin.
 * @param logger Optional logger with error/info/debug methods. Defaults to console.
 */
export async function unregisterServiceWorker(logger?: {
  error?: (err: unknown) => void;
  info?: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
}): Promise<void> {
  const _logger = {
    error: logger?.error ?? ((err: unknown) => console.error('[SW] error:', err)),
    info: logger?.info ?? ((...args: unknown[]) => console.info('[SW]', ...args)),
    debug: logger?.debug ?? ((...args: unknown[]) => console.debug('[SW]', ...args)),
  };

  if (!isServiceWorkerSupported()) {
    _logger.debug('Service workers are not supported in this environment; nothing to unregister.');
    return;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    _logger.info(`Found ${registrations.length} service worker registration(s) to unregister.`);

    const unsetPromises: Promise<boolean>[] = registrations.map(async (reg) => {
      try {
        // Try to message the waiting worker to skipWaiting before unregistering, if desired.
        // Not all SWs will handle this message; ignore failures but log them.
        if (reg.waiting) {
          try {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            _logger.debug('Posted SKIP_WAITING to waiting worker.');
          } catch (msgErr) {
            _logger.debug('Failed to post SKIP_WAITING to waiting worker:', msgErr);
          }
        }
        const result = await reg.unregister();
        _logger.info('Unregistered service worker registration:', result);
        return result;
      } catch (err) {
        _logger.error('Failed to unregister a service worker registration:', err);
        return false;
      }
    });

    await Promise.all(unsetPromises);
    _logger.info('Service worker unregistration attempts complete.');
  } catch (err) {
    _logger.error('Failed while getting service worker registrations or unregistering:', err);
  }
}