export function isValidEmail(email: string): boolean {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;

  // Must contain exactly one '@'
  if (trimmed.indexOf('@') !== trimmed.lastIndexOf('@')) return false;
  const atIdx = trimmed.indexOf('@');
  if (atIdx <= 0 || atIdx === trimmed.length - 1) return false;

  const local = trimmed.slice(0, atIdx);
  const domain = trimmed.slice(atIdx + 1);

  // Local-part checks: no spaces, not starting/ending with dot, no consecutive dots
  if (local.length === 0) return false;
  if (/\s/.test(local)) return false;
  if (local.startsWith('.') || local.endsWith('.')) return false;
  if (local.includes('..')) return false;
  // allow reasonably common characters in local (not RFC-perfect)
  // Permit letters, digits, and these symbols: !#$%&'*+/=?^_`{|}~-. (dot handled above)
  if (!/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~\-.]+$/.test(local)) return false;

  // Domain checks: labels separated by dots
  const labels = domain.split('.');
  if (labels.length < 2) return false; // require at least one dot (i.e., TLD present)

  const labelRegex = /^[A-Za-z0-9-]{1,63}$/;
  for (let i = 0; i < labels.length; i++) {
    const lbl = labels[i];
    if (!labelRegex.test(lbl)) return false;
    // labels must not start or end with '-'
    if (lbl.startsWith('-') || lbl.endsWith('-')) return false;
  }

  // TLD length at least 2 characters and only letters (common constraint)
  const tld = labels[labels.length - 1];
  if (tld.length < 2) return false;
  if (!/^[A-Za-z]{2,63}$/.test(tld)) return false;

  return true;
}

export function validatePhone(phone: string): boolean {
  if (typeof phone !== 'string') return false;
  const trimmed = phone.trim();
  if (trimmed.length === 0) return false;

  // Only one leading + allowed and if present must be first char
  const plusCount = (trimmed.match(/\+/g) || []).length;
  if (plusCount > 1) return false;
  if (plusCount === 1 && !trimmed.startsWith('+')) return false;

  // Remove permitted separators and leading plus for digit count/validation
  const digitsOnly = trimmed.replace(/[\s\-().]/g, '').replace(/^\+/, '');
  if (!/^\d+$/.test(digitsOnly)) return false;

  const len = digitsOnly.length;
  // Reasonable range (local numbers to international E.164)
  if (len < 7 || len > 15) return false;

  return true;
}

/**
 * Decode base64 string to Uint8Array.
 * Works in browser (atob) and Node (Buffer). Returns null on failure.
 */
function decodeBase64ToBytes(b64: string): Uint8Array | null {
  try {
    // Normalize padding: add '=' to make length multiple of 4
    const pad = (4 - (b64.length % 4)) % 4;
    if (pad) b64 = b64 + '='.repeat(pad);

    // Use atob if available (browsers)
    if (typeof atob === 'function') {
      const binary = atob(b64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }

    // Fallback to Node Buffer
    if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
      const buf = Buffer.from(b64, 'base64');
      return new Uint8Array(buf);
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check byte signatures for known image types.
 */
function hasImageSignature(bytes: Uint8Array): boolean {
  if (!bytes || bytes.length === 0) return false;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4E &&
      bytes[3] === 0x47) {
    return true;
  }

  // JPEG: FF D8 FF
  if (bytes.length >= 3 &&
      bytes[0] === 0xFF &&
      bytes[1] === 0xD8 &&
      bytes[2] === 0xFF) {
    return true;
  }

  // GIF: 'G' 'I' 'F' (47 49 46)
  if (bytes.length >= 3 &&
      bytes[0] === 0x47 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46) {
    return true;
  }

  // WEBP: 'RIFF'....'WEBP' (RIFF at 0-3, WEBP at 8-11)
  if (bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50) {
    return true;
  }

  return false;
}

/**
 * Validate whether a string is a base64-encoded image.
 * Accepts data URIs (data:image/..;base64,...) or raw base64 payloads.
 * Uses decoding + signature checking instead of strict regex/padding rules.
 */
export function isBase64Image(str: string): boolean {
  if (typeof str !== 'string') return false;
  const s = str.trim();
  if (s.length === 0) return false;

  // Data URI: capture mediatype and payload
  const dataUriMatch = s.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\sA-Za-z0-9+/=]+)$/);
  if (dataUriMatch) {
    const mediaType = dataUriMatch[1];
    let payload = dataUriMatch[2].replace(/\s+/g, '');
    // Quick character sanity check
    if (!/^[A-Za-z0-9+/=]*$/.test(payload)) return false;
    const bytes = decodeBase64ToBytes(payload);
    if (!bytes) return false;
    // Verify signature bytes for common image formats
    if (!hasImageSignature(bytes)) return false;
    // Optionally, ensure mediaType matches detected signature minimally
    // (e.g., image/png contains PNG signature). We'll do a minimal consistency check:
    if (mediaType.toLowerCase().includes('png') && bytes[0] === 0x89 && bytes[1] === 0x50) return true;
    if (mediaType.toLowerCase().includes('jpeg') && bytes[0] === 0xFF && bytes[1] === 0xD8) return true;
    if (mediaType.toLowerCase().includes('jpg') && bytes[0] === 0xFF && bytes[1] === 0xD8) return true;
    if (mediaType.toLowerCase().includes('gif') && bytes[0] === 0x47 && bytes[1] === 0x49) return true;
    if (mediaType.toLowerCase().includes('webp') && bytes[0] === 0x52 && bytes[8] === 0x57) return true;
    // If mediaType didn't match but signature indicates an image, still accept
    return true;
  }

  // Raw base64 payload: strip whitespace and validate chars
  const raw = s.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/=]*$/.test(raw)) return false;
  const bytes = decodeBase64ToBytes(raw);
  if (!bytes) return false;
  if (!hasImageSignature(bytes)) return false;

  return true;
}

/* Booking draft validation helpers and function */

type BookingDraft = {
  fullName?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  start?: unknown;
  date?: unknown;
  time?: unknown;
  durationMinutes?: unknown;
  duration?: unknown;
  guests?: unknown;
  guestCount?: unknown;
  packageId?: unknown;
  packageName?: unknown;
  venue?: unknown;
  address?: unknown;
  notes?: unknown;
  termsAccepted?: unknown;
  agreeToTerms?: unknown;
  [key: string]: unknown;
};

function isNonEmptyString(x: unknown): x is string {
  return typeof x === 'string' && x.trim().length > 0;
}

function isPositiveInteger(value: unknown): boolean {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return true;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0;
  }
  return false;
}

/**
 * Robust toDate:
 * - Accepts Date instance, numeric timestamp
 * - For strings, prefers ISO-like inputs. If string looks like "YYYY-MM-DD HH:mm" it'll convert to "YYYY-MM-DDTHH:mm"
 * - Falls back to Date.parse for other formats
 */
function toDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string') {
    let s = value.trim();
    if (s.length === 0) return null;

    // If it's a date + time with space (common input), convert to 'T' to make it ISO-ish: YYYY-MM-DD HH:mm -> YYYY-MM-DDTHH:mm
    // Only do this when the start looks like YYYY-MM-DD
    const dateTimeMatch = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}:\d{2}(?::\d{2})?)(.*)$/);
    if (dateTimeMatch) {
      const datePart = dateTimeMatch[1];
      const timePart = dateTimeMatch[2];
      const rest = dateTimeMatch[3] || '';
      s = `${datePart}T${timePart}${rest}`;
    }

    // Attempt parse
    const parsed = Date.parse(s);
    if (!Number.isNaN(parsed)) return new Date(parsed);

    // Some inputs might be like "MM/DD/YYYY" or other locales; try Date constructor as a last resort
    try {
      const d = new Date(s);
      if (!Number.isNaN(d.getTime())) return d;
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Combine date and time strings into an ISO-like string where possible.
 * If date looks like YYYY-MM-DD, produce YYYY-MM-DDTHH:mm[:ss]
 * Otherwise, return `${date} ${time}` to let toDate attempt parsing.
 */
function combineDateTime(dateStr: string, timeStr: string): string {
  const d = dateStr.trim();
  const t = timeStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    // ensure time includes seconds optional
    if (/^\d{1,2}:\d{2}$/.test(t) || /^\d{1,2}:\d{2}:\d{2}$/.test(t)) {
      return `${d}T${t}`;
    }
    // maybe time includes AM/PM or timezone; just attach with T
    return `${d}T${t}`;
  }
  // fallback
  return `${d} ${t}`;
}

function isAccepted(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'yes' || v === 'y' || v === 'on';
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  return false;
}

export function validateBookingDraft(draft: any): string[] {
  const errors: string[] = [];
  const d: BookingDraft = draft || {};

  // Name validation: prefer fullName, else firstName + lastName
  let name = '';
  if (isNonEmptyString(d.fullName)) {
    name = d.fullName!.trim();
  } else if (isNonEmptyString(d.firstName) || isNonEmptyString(d.lastName)) {
    const parts: string[] = [];
    if (isNonEmptyString(d.firstName)) parts.push(d.firstName!.trim());
    if (isNonEmptyString(d.lastName)) parts.push(d.lastName!.trim());
    name = parts.join(' ');
  } else if (isNonEmptyString(d.name)) {
    name = d.name!.trim();
  }

  if (!name || name.length < 2) {
    errors.push('Please provide a valid name.');
  }

  // Email
  if (!isNonEmptyString(d.email) || !isValidEmail((d.email as string).trim())) {
    errors.push('Please provide a valid email address.');
  }

  // Phone
  if (!isNonEmptyString(d.phone) || !validatePhone((d.phone as string).trim())) {
    errors.push('Please provide a valid phone number.');
  }

  // Date / start
  let startDate: Date | null = null;
  if (d.start) {
    startDate = toDate(d.start);
  } else if (d.date && d.time) {
    if (isNonEmptyString(d.date) && isNonEmptyString(d.time)) {
      const combined = combineDateTime(d.date as string, d.time as string);
      startDate = toDate(combined);
    }
  } else if (d.date) {
    startDate = toDate(d.date);
  }

  if (!startDate) {
    errors.push('Please select a valid start date and time.');
  } else {
    const now = new Date();
    const minLeadMs = 10 * 60 * 1000; // 10 minutes
    if (startDate.getTime() < now.getTime() + minLeadMs) {
      errors.push('Booking time must be at least 10 minutes in the future.');
    }
    const maxFutureMs = 2 * 365 * 24 * 60 * 60 * 1000; // ~2 years
    if (startDate.getTime() > now.getTime() + maxFutureMs) {
      errors.push('Booking date is too far in the future.');
    }
  }

  // Duration (minutes)
  const durationVal = (d.durationMinutes ?? d.duration) as unknown;
  if (durationVal !== undefined && durationVal !== null && durationVal !== '') {
    if (!isPositiveInteger(durationVal)) {
      errors.push('Duration must be a positive whole number of minutes.');
    } else {
      const durationNum = typeof durationVal === 'number' ? durationVal : Number(durationVal);
      if (durationNum < 5) errors.push('Duration must be at least 5 minutes.');
      if (durationNum > 1440) errors.push('Duration must be less than 24 hours.');
    }
  } else {
    errors.push('Please specify a duration for the booking.');
  }

  // Guests
  const guestsVal = (d.guests ?? d.guestCount) as unknown;
  if (guestsVal !== undefined && guestsVal !== null && guestsVal !== '') {
    if (!isPositiveInteger(guestsVal)) {
      errors.push('Guest count must be a positive whole number.');
    } else {
      const g = Number(guestsVal);
      if (g > 1000) errors.push('Guest count is unrealistically large.');
      if (g < 1) errors.push('Guest count must be at least 1.');
    }
  } else {
    errors.push('Please specify the number of guests.');
  }

  // Package
  if (!isNonEmptyString(d.packageId) && !isNonEmptyString(d.packageName)) {
    errors.push('Please select a package.');
  }

  // Venue/address: if venue provided require non-empty; else accept address
  if (d.venue !== undefined && d.venue !== null) {
    if (!isNonEmptyString(d.venue) && !isNonEmptyString(d.address)) {
      errors.push('Please provide a valid venue or address.');
    }
  } else if (d.address !== undefined && d.address !== null) {
    if (!isNonEmptyString(d.address)) errors.push('Please provide a valid address.');
  }

  // Terms: accept boolean true or common truthy representations
  const terms = d.termsAccepted ?? d.agreeToTerms;
  if (!isAccepted(terms)) {
    errors.push('You must accept the terms and conditions to proceed.');
  }

  // Optional: notes length guard
  if (isNonEmptyString(d.notes) && (d.notes as string).length > 2000) {
    errors.push('Notes are too long.');
  }

  return errors;
}