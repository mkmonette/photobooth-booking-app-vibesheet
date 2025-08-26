declare const self: ServiceWorkerGlobalScope;

const CACHE_NAME = 'photobooth-cache-v1';
const PRECACHE_URLS: string[] = [
  '/',
  '/index.html',
  '/favicon.ico',
  '/manifest.json',
  // add other static assets you want pre-cached here if applicable
];

async function broadcastMessage(message: any): Promise<void> {
  try {
    const allClients = await self.clients.matchAll({
      includeUncontrolled: true,
      type: 'window',
    });
    for (const client of allClients) {
      try {
        client.postMessage(message);
      } catch (err) {
        // ignore per-client errors
      }
    }
  } catch (err) {
    // no-op
  }
}

function isHtmlResponse(response: Response | undefined | null): boolean {
  if (!response) return false;
  try {
    const contentType = response.headers.get && response.headers.get('content-type');
    return response.ok && !response.redirected && typeof contentType === 'string' && contentType.includes('text/html');
  } catch {
    return false;
  }
}

function handlePushEvent(event: any): void {
  // Best-effort handling of push payloads. Supports JSON or plain text payloads.
  event.waitUntil(
    (async () => {
      let payload: any = {};
      try {
        if (event.data) {
          try {
            // Prefer structured JSON payloads
            const maybeJson = await event.data.json();
            // Normalize primitives to an object
            if (maybeJson === null || typeof maybeJson !== 'object') {
              payload = { text: String(maybeJson) };
            } else {
              payload = maybeJson;
            }
          } catch {
            // fallback to text
            try {
              const txt = await event.data.text();
              payload = { text: txt };
            } catch {
              payload = {};
            }
          }
        }
      } catch {
        payload = {};
      }

      const title = (payload && payload.title) || 'Photobooth';
      const body = (payload && (payload.body || payload.message || payload.text)) || 'You have a new notification';
      const tag = payload && payload.tag;
      const icon = (payload && payload.icon) || '/icons/icon-192.png';
      const badge = (payload && payload.badge) || '/icons/badge-72.png';

      const options: NotificationOptions = {
        body,
        icon,
        badge,
        data: {
          source: 'photobooth-sw',
          payload,
        },
        tag,
        renotify: !!tag,
        actions: Array.isArray(payload && payload.actions) ? payload.actions : [],
      };

      try {
        await self.registration.showNotification(title, options);
      } catch {
        // If showing notification fails, still try to notify clients
      }

      // Notify open clients about the push so the app can update UI if needed
      try {
        await broadcastMessage({ type: 'PUSH_RECEIVED', payload });
      } catch {
        // swallow
      }
    })()
  );
}

function handleSyncEvent(event: any): void {
  // Background sync is limited in what SW can access (no localStorage).
  // Best approach: notify clients that a sync event occurred and let them
  // perform any work (they can access localStorage/IndexedDB).
  const tag = event.tag;

  event.waitUntil(
    (async () => {
      try {
        await broadcastMessage({ type: 'SYNC_TRIGGER', tag });
        // Give clients some time to respond/perform sync work. We cannot
        // reliably receive a response from clients in all environments,
        // so wait a short time but do not block forever.
        await new Promise((resolve) => setTimeout(resolve, 5000));
      } catch {
        // swallow errors; ensure event resolves
      }
    })()
  );
}

function registerWorkerListeners(): void {
  // Install: pre-cache core assets
  self.addEventListener('install', (event: any) => {
    event.waitUntil(
      (async () => {
        try {
          const cache = await caches.open(CACHE_NAME);
          // Add resources one-by-one so one failure doesn't reject the entire install.
          for (const url of PRECACHE_URLS) {
            try {
              await cache.add(url);
            } catch (err) {
              // Log individual resource failures to aid debugging
              try {
                console.error(`[SW] Failed to precache ${url}:`, err);
              } catch {
                // ignore logging errors
              }
            }
          }
        } catch (err) {
          try {
            console.error('[SW] Precache open failed:', err);
          } catch {
            // ignore
          }
        }
        // Activate new service worker immediately
        try {
          await (self as any).skipWaiting();
        } catch (err) {
          // ignore
        }
      })()
    );
  });

  // Activate: clean up old caches and take control of clients
  self.addEventListener('activate', (event: any) => {
    event.waitUntil(
      (async () => {
        try {
          const keys = await caches.keys();
          await Promise.all(
            keys
              .filter((key) => key !== CACHE_NAME)
              .map((key) => caches.delete(key))
          );
        } catch (err) {
          try {
            console.error('[SW] Cache cleanup failed:', err);
          } catch {
            // ignore
          }
        }
        try {
          await (self as any).clients.claim();
        } catch (err) {
          // ignore
        }
      })()
    );
  });

  // Fetch: navigation requests fallback to cached index.html for SPA routing.
  // Other requests use a cache-first strategy with network fallback.
  self.addEventListener('fetch', (event: any) => {
    const request = event.request;

    // Only handle GET requests
    if (!request || request.method !== 'GET') {
      return;
    }

    const isNavigation =
      request.mode === 'navigate' ||
      (request.headers && request.headers.get && request.headers.get('accept')?.includes('text/html'));

    if (isNavigation) {
      event.respondWith(
        (async () => {
          try {
            // Try network first for navigation to get freshest content
            const networkResponse = await fetch(request);
            // Cache a copy of index for offline fallbacks only if it looks like the app shell HTML
            try {
              if (isHtmlResponse(networkResponse)) {
                const cache = await caches.open(CACHE_NAME);
                try {
                  await cache.put('/index.html', networkResponse.clone());
                } catch (err) {
                  // ignore cache put errors but log in dev
                  try {
                    console.error('[SW] Failed to cache /index.html:', err);
                  } catch {
                    // ignore
                  }
                }
              }
            } catch {
              // ignore
            }
            return networkResponse;
          } catch {
            // Network failed; return cached index.html or offline response
            try {
              const cached = await caches.match('/index.html');
              if (cached) return cached;
            } catch {
              // ignore
            }
            return new Response('Offline', { status: 503, statusText: 'Offline' });
          }
        })()
      );
      return;
    }

    // For other requests, respond with cache-first, then network, then fallback to fetch error
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const cachedResponse = await cache.match(request);
          if (cachedResponse) return cachedResponse;
        } catch {
          // ignore cache match errors
        }
        try {
          const networkResponse = await fetch(request);
          // Cache static assets as they are fetched (only if OK)
          if (networkResponse && networkResponse.ok) {
            try {
              await cache.put(request, networkResponse.clone());
            } catch (err) {
              try {
                console.error('[SW] Failed to cache fetched resource:', err);
              } catch {
                // ignore
              }
            }
          }
          return networkResponse;
        } catch {
          // If neither cache nor network are available, fail gracefully
          return new Response(null, { status: 504, statusText: 'Gateway Timeout' });
        }
      })()
    );
  });

  // Push events
  self.addEventListener('push', (event: any) => {
    try {
      handlePushEvent(event);
    } catch {
      // ensure runtime stability
    }
  });

  // Background sync events
  self.addEventListener('sync', (event: any) => {
    try {
      handleSyncEvent(event);
    } catch {
      // ensure runtime stability
    }
  });

  // Notification click (handle action clicks)
  self.addEventListener('notificationclick', (event: any) => {
    event.notification.close();
    const payload = event.notification?.data || {};
    event.waitUntil(
      (async () => {
        try {
          // Try to focus an existing client
          const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
          if (allClients.length > 0) {
            const client = allClients[0];
            try {
              client.focus && (await client.focus());
            } catch {
              // ignore focus errors
            }
            try {
              client.postMessage({ type: 'NOTIFICATION_CLICK', payload });
            } catch {
              // ignore postMessage errors
            }
            return;
          }
          // If no client, open the app
          await self.clients.openWindow(payload.url || '/');
        } catch {
          // ignore errors
        }
      })()
    );
  });

  // Message events from clients (pages)
  self.addEventListener('message', (event: any) => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    switch (data.type) {
      case 'SKIP_WAITING':
        // Page requests the SW to skip waiting and activate immediately
        // Ensure the worker stays alive until skipWaiting + clients.claim complete.
        event.waitUntil(
          (async () => {
            try {
              await (self as any).skipWaiting();
              await (self as any).clients.claim();
            } catch {
              // ignore
            }
          })()
        );
        break;
      case 'BROADCAST':
        // Broadcast a message to all clients
        // If the caller wants to wait for the broadcast to finish they could use postMessage with a handshake;
        // here we at least attempt to perform the operation and swallow errors.
        event.waitUntil(
          (async () => {
            try {
              await broadcastMessage(data.payload);
            } catch {
              // ignore
            }
          })()
        );
        break;
      case 'PING':
        // Simple ping-pong for liveness checks
        if (event.source && typeof event.source.postMessage === 'function') {
          try {
            event.source.postMessage({ type: 'PONG', id: data.id });
          } catch {
            // ignore
          }
        }
        break;
      default:
        // Unknown message type ? optionally broadcast to other clients
        break;
    }
  });
}

// Initialize listeners immediately when the script is evaluated
registerWorkerListeners();

// Export functions for potential external/unit testing usage (no-op in runtime)
export { registerWorkerListeners, handlePushEvent, handleSyncEvent, broadcastMessage };