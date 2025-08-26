const ADMIN_PIN_KEY = 'photobooth_admin_pin';
const SESSION_KEY = 'photobooth_session';

const PBKDF2_ITERATIONS = 120000;
const HASH_ALGO = 'SHA-256';
const DERIVED_KEY_BYTES = 32; // 256-bit

function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function fromHex(hex: string): Uint8Array {
  if (!hex) return new Uint8Array();
  const normalized = hex.trim();
  if (normalized.length % 2 !== 0) {
    throw new Error('Invalid hex string');
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(normalized.substr(i * 2, 2), 16);
  }
  return bytes;
}

function base64UrlEncode(bytes: Uint8Array): string {
  // Build binary string in safe chunks to avoid spreading huge arrays as arguments
  const chunkSize = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  const b64 = btoa(binary);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateRandomBytes(length: number): Uint8Array {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return arr;
}

async function deriveKey(pin: string, salt: Uint8Array, iterations = PBKDF2_ITERATIONS, keyLen = DERIVED_KEY_BYTES): Promise<Uint8Array> {
  const canonicalPin = typeof pin === 'string' ? pin.trim() : '';
  const enc = new TextEncoder();
  const passKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(canonicalPin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations,
      hash: HASH_ALGO,
    },
    passKey,
    keyLen * 8
  );
  return new Uint8Array(derived);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Creates a salted hash string for storage.
 * Format: iterations.saltHex.hashHex
 */
export async function hashPin(pin: string): Promise<string> {
  if (typeof pin !== 'string') throw new Error('Pin must be a string');
  const trimmed = pin.trim();
  if (trimmed.length === 0) throw new Error('Pin must not be empty');
  const salt = generateRandomBytes(16);
  const derived = await deriveKey(trimmed, salt, PBKDF2_ITERATIONS, DERIVED_KEY_BYTES);
  const saltHex = toHex(salt);
  const hashHex = toHex(derived);
  return `${PBKDF2_ITERATIONS}.${saltHex}.${hashHex}`;
}

/**
 * Stores an admin PIN (salted+hashed) in localStorage.
 * Overwrites any existing admin PIN.
 */
export async function setAdminPin(pin: string): Promise<void> {
  if (typeof pin !== 'string') throw new Error('Pin must be a string');
  const trimmed = pin.trim();
  if (trimmed.length < 4) {
    throw new Error('PIN must be at least 4 characters');
  }
  const serialized = await hashPin(trimmed);
  localStorage.setItem(ADMIN_PIN_KEY, serialized);
}

/**
 * Verifies a provided admin PIN against the stored hash.
 * Returns true if match, false otherwise.
 */
export async function verifyAdminPin(pin: string): Promise<boolean> {
  if (typeof pin !== 'string') return false;
  const canonicalPin = pin.trim();
  const stored = localStorage.getItem(ADMIN_PIN_KEY);
  if (!stored) return false;

  const parts = stored.split('.');
  if (parts.length !== 3) return false;
  const iterations = parseInt(parts[0], 10);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  const saltHex = parts[1];
  const hashHex = parts[2];

  try {
    const salt = fromHex(saltHex);
    const expected = fromHex(hashHex);
    const derived = await deriveKey(canonicalPin, salt, iterations, expected.length);
    return constantTimeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * Creates a lightweight session for a customer by email and stores in localStorage.
 * Returns { sessionId } on success or null for invalid input.
 */
export async function loginCustomerByEmail(email: string): Promise<{ sessionId: string } | null> {
  if (typeof email !== 'string') return null;
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return null;

  // Basic email pattern check (not exhaustive but prevents obvious invalid values)
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(trimmed)) return null;

  // Create a cryptographically random session id (base64url of 16 bytes + timestamp)
  const rand = generateRandomBytes(16);
  const id = `${base64UrlEncode(rand)}.${Date.now().toString(36)}`;

  const session = {
    sessionId: id,
    email: trimmed,
    createdAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return { sessionId: id };
  } catch {
    return null;
  }
}

/**
 * Clears stored session data (logs out).
 */
export async function logout(): Promise<void> {
  localStorage.removeItem(SESSION_KEY);
}

export default {
  setAdminPin,
  verifyAdminPin,
  loginCustomerByEmail,
  logout,
  hashPin,
};