const STORAGE_KEY = 'pb_reminders_v1';
const MAX_ATTEMPTS = 5;

let templates: TemplatesMap = {
  default: (payload: any) => {
    const title = payload?.title ?? 'Reminder';
    const body = payload?.message ?? JSON.stringify(payload ?? {});
    return { title, body, data: payload };
  },
};

function safeParse(json: string | null): any {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function saveReminders(reminders: Reminder[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
  } catch {
    // ignore storage failures (quota etc.)
  }
}

function loadReminders(): Reminder[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = safeParse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed as Reminder[];
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
    try {
      return (crypto as any).randomUUID();
    } catch {
      // fallback below
    }
  }
  // fallback UUID v4-like
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    // eslint-disable-next-line no-mixed-operators
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function isoString(date: Date) {
  return date.toISOString();
}

/**
 * Render a template renderer into { title?, body?, data }.
 * Precedence:
 *  - function renderer(payload) => result
 *  - object renderer { title?: string, body?: string } with template strings
 *  - string renderer => treated as body template (title left to payload.title or fallback)
 */
function renderTemplate(renderer: TemplateRenderer | any, payload: any) {
  if (typeof renderer === 'function') {
    try {
      return renderer(payload) ?? {};
    } catch {
      return {};
    }
  }

  const out = {
    title: undefined as string | undefined,
    body: undefined as string | undefined,
    data: payload,
  };

  if (renderer && typeof renderer === 'object') {
    // object renderer: may contain title and/or body templates
    try {
      const tplTitle = typeof renderer.title === 'string' ? renderer.title : undefined;
      const tplBody = typeof renderer.body === 'string' ? renderer.body : undefined;

      const replace = (tpl: string) =>
        tpl.replace(/{{\s*([^}\s]+)\s*}}/g, (_m, key) => {
          const val = key.split('.').reduce((acc: any, k: string) => (acc ? acc[k] : undefined), payload);
          return val === undefined || val === null ? '' : String(val);
        });

      if (tplTitle) out.title = replace(tplTitle);
      if (tplBody) out.body = replace(tplBody);
    } catch {
      // ignore and return defaults
    }
    return out;
  }

  if (typeof renderer === 'string') {
    // Treat a plain string renderer as a body template only.
    try {
      const replace = (tpl: string) =>
        tpl.replace(/{{\s*([^}\s]+)\s*}}/g, (_m, key) => {
          const val = key.split('.').reduce((acc: any, k: string) => (acc ? acc[k] : undefined), payload);
          return val === undefined || val === null ? '' : String(val);
        });
      out.body = replace(renderer);
    } catch {
      // ignore
    }
    return out;
  }

  return out;
}

export function configureTemplates(t: TemplatesMap): void {
  templates = { ...templates, ...(t || {}) };
}

export function scheduleReminder(reminder: {
  id?: string;
  at: string;
  payload: any;
}): string {
  if (!reminder || !reminder.at) {
    throw new Error('Invalid reminder: missing "at" field.');
  }
  const atDate = new Date(reminder.at);
  if (Number.isNaN(atDate.getTime())) {
    throw new Error('Invalid "at" date.');
  }
  const now = new Date();
  const id = reminder.id ? String(reminder.id) : makeId();
  const reminders = loadReminders();
  const existingIndex = reminders.findIndex((r) => r.id === id);

  if (existingIndex >= 0) {
    // Update conservatively: preserve immutable metadata like createdAt and attempts.
    const existing = reminders[existingIndex];
    const updated = {
      ...existing,
      at: isoString(atDate),
      payload: reminder.payload ?? existing.payload,
      // do not reset attempts or createdAt; preserve status unless explicitly provided in payload
    } as Reminder;
    reminders[existingIndex] = updated;
  } else {
    const base: Reminder = {
      id,
      at: isoString(atDate),
      payload: reminder.payload,
      attempts: 0,
      status: 'pending',
      createdAt: isoString(now),
    };
    reminders.push(base);
  }

  saveReminders(reminders);
  return id;
}

async function dispatchInAppNotification(detail: any) {
  try {
    const event = new CustomEvent('pb:notification', { detail });
    window.dispatchEvent(event);
  } catch {
    // ignore if environments don't support CustomEvent
    try {
      // as fallback put it on window object
      (window as any).__pb_last_notification = detail;
    } catch {
      // ignore
    }
  }
}

async function showBrowserNotification(title?: string, options?: NotificationOptions) {
  if (!('Notification' in window)) {
    return;
  }
  if (Notification.permission === 'granted') {
    try {
      new Notification(title ?? '', options);
    } catch {
      // ignore
    }
    return;
  }
  if (Notification.permission === 'denied') {
    return;
  }
  // permission is 'default' - request
  try {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      try {
        new Notification(title ?? '', options);
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}

export async function sendNotification(target: any, payload: any): Promise<void> {
  // Determine template/renderer
  let renderer: TemplateRenderer | any | undefined;
  if (payload && payload.templateKey && typeof payload.templateKey === 'string') {
    renderer = templates[payload.templateKey] ?? templates.default;
  } else if (target && typeof target === 'string' && templates[target]) {
    renderer = templates[target];
  } else {
    renderer = templates.default;
  }

  const rendered = renderTemplate(renderer, payload);
  const title = rendered.title ?? payload?.title ?? 'Notification';
  const body = rendered.body ?? payload?.message ?? undefined;
  const data = rendered.data ?? payload;

  // If Notification API is available and allowed, use it; otherwise dispatch in-app event
  try {
    await showBrowserNotification(title, {
      body,
      data,
      icon: payload?.icon,
      badge: payload?.badge,
    });
  } catch {
    // ignore
  }

  // Always dispatch an in-app event so the UI can show toasts or handle notifications
  try {
    await dispatchInAppNotification({ title, body, data, target });
  } catch {
    // ignore
  }

  // As a final fallback, log to console
  try {
    // eslint-disable-next-line no-console
    console.info('Notification:', { title, body, data, target });
  } catch {
    // ignore
  }
}

export async function runDueReminders(now?: Date): Promise<void> {
  const current = now ?? new Date();
  const reminders = loadReminders();
  if (!reminders.length) return;

  // Work on a mutable copy and persist progressive updates to avoid duplicates across tabs.
  let changed = false;
  for (let i = 0; i < reminders.length; i++) {
    const r = reminders[i];
    // skip already sent
    if (r.status === 'sent') continue;
    const scheduled = new Date(r.at);
    if (Number.isNaN(scheduled.getTime())) {
      // invalid date: mark failed to avoid infinite loop, preserve createdAt/attempts but increment attempts once
      const newAttempts = (r.attempts || 0) + 1;
      reminders[i] = {
        ...r,
        attempts: newAttempts,
        status: newAttempts >= MAX_ATTEMPTS ? 'failed' : 'failed',
        lastAttemptAt: isoString(new Date()),
      };
      changed = true;
      saveReminders(reminders);
      continue;
    }
    if (scheduled.getTime() <= current.getTime()) {
      if (r.at && r.at.length === 0) continue;

      // Mark as sending first (do NOT increment attempts yet). Persist so other tabs see in-progress.
      reminders[i] = {
        ...r,
        status: 'sending',
      };
      changed = true;
      saveReminders(reminders);

      try {
        await sendNotification(r.payload?.target ?? null, r.payload);
        reminders[i] = {
          ...reminders[i],
          status: 'sent',
          sentAt: isoString(new Date()),
        };
        changed = true;
        saveReminders(reminders);
      } catch (err) {
        // increment attempts and set lastAttemptAt; switch to pending or failed depending on attempts
        const prevAttempts = r.attempts || 0;
        const newAttempts = prevAttempts + 1;
        reminders[i] = {
          ...reminders[i],
          attempts: newAttempts,
          lastAttemptAt: isoString(new Date()),
          status: newAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
        };
        changed = true;
        saveReminders(reminders);
      }
    }
  }

  if (changed) {
    // ensure persisted
    saveReminders(reminders);
  }
}

export default {
  scheduleReminder,
  runDueReminders,
  sendNotification,
  configureTemplates,
};