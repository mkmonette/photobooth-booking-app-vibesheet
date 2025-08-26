const STORAGE_KEYS = {
  ADMIN: "photobooth:admin",
  BOOKINGS: "photobooth:bookings",
  CUSTOMERS: "photobooth:customers",
  SERVICES: "photobooth:services",
  SETTINGS: "photobooth:settings",
  DEMO_FLAG: "photobooth:demoSeeded",
};

function generateId(prefix = "") {
  return `${prefix}${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;
}

function toHex(buffer: ArrayBuffer | Uint8Array) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface AdminRecord {
  pinHash: string;
  createdAt: string;
  seededDemo?: boolean;
}

interface Props {
  onComplete?: () => void;
}

const PBKDF2_ITERATIONS = 100000;
const SALT_BYTES = 16;
const DERIVED_KEY_BITS = 256; // produce 256-bit hash

async function derivePinHash(pin: string): Promise<string> {
  if (typeof window === "undefined" || !window.crypto || !window.crypto.subtle) {
    throw new Error(
      "Secure cryptography is not available in this environment. Please use a modern browser with Web Crypto API support."
    );
  }

  const enc = new TextEncoder();
  const pinBytes = enc.encode(pin);

  // generate salt
  const salt = new Uint8Array(SALT_BYTES);
  window.crypto.getRandomValues(salt);

  // import key material
  const key = await window.crypto.subtle.importKey(
    "raw",
    pinBytes,
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  // derive bits using PBKDF2 with HMAC-SHA-256
  const derived = await window.crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt.buffer,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    key,
    DERIVED_KEY_BITS
  );

  const hashHex = toHex(derived);
  const saltHex = toHex(salt);
  // Format: pbkdf2$iterations$saltHex$hashHex
  return `pbkdf2$${PBKDF2_ITERATIONS}$${saltHex}$${hashHex}`;
}

export async function setAdminPin(pin: string): Promise<void> {
  const hashed = await derivePinHash(pin);
  const record: AdminRecord = {
    pinHash: hashed,
    createdAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORAGE_KEYS.ADMIN, JSON.stringify(record));
  } catch (err) {
    console.error("Failed to write admin record to localStorage:", err);
    throw new Error("Failed to save admin PIN to local storage. Check browser storage settings.");
  }
}

/**
 * seedDemoData
 * Writes demo data to localStorage. If demo data already present, it will be overwritten
 * when this function is called (explicit user action required in UI).
 */
export async function seedDemoData(): Promise<void> {
  // Build demo services
  const services = [
    {
      id: generateId("svc_"),
      name: "Classic Photo Session",
      durationMinutes: 30,
      priceCents: 5000,
      description: "One photobooth session with 10 digital photos.",
    },
    {
      id: generateId("svc_"),
      name: "Event Package",
      durationMinutes: 120,
      priceCents: 20000,
      description: "Full event coverage with unlimited booths and prints.",
    },
    {
      id: generateId("svc_"),
      name: "Mini Booth",
      durationMinutes: 15,
      priceCents: 2500,
      description: "Quick booth for quick memories.",
    },
  ];

  // Demo customers
  const customers = [
    {
      id: generateId("cus_"),
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "+1 555-0100",
      notes: "Prefers outdoor locations.",
    },
    {
      id: generateId("cus_"),
      name: "Acme Corp",
      email: "events@acme.example",
      phone: "+1 555-0200",
      notes: "Corporate bookings, invoice billing.",
    },
  ];

  // Demo bookings
  const now = Date.now();
  const bookings = [
    {
      id: generateId("bk_"),
      serviceId: services[0].id,
      customerId: customers[0].id,
      start: new Date(now + 1000 * 60 * 60 * 24).toISOString(),
      end: new Date(now + 1000 * 60 * 60 * 24 + services[0].durationMinutes * 60000).toISOString(),
      status: "confirmed",
      notes: "Birthday party at Riverside Park.",
    },
    {
      id: generateId("bk_"),
      serviceId: services[1].id,
      customerId: customers[1].id,
      start: new Date(now + 1000 * 60 * 60 * 24 * 7).toISOString(),
      end: new Date(now + 1000 * 60 * 60 * 24 * 7 + services[1].durationMinutes * 60000).toISOString(),
      status: "pending",
      notes: "Company picnic.",
    },
  ];

  const settings = {
    businessName: "Demo Photobooth Co.",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    currency: "USD",
    theme: "light",
    createdAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(STORAGE_KEYS.SERVICES, JSON.stringify(services));
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
    localStorage.setItem(STORAGE_KEYS.BOOKINGS, JSON.stringify(bookings));
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    localStorage.setItem(STORAGE_KEYS.DEMO_FLAG, "true");
  } catch (err) {
    console.error("Failed to write demo data to localStorage:", err);
    throw new Error("Failed to write demo data to storage.");
  }
}

export default function AdminSetupWizard({ onComplete }: Props): JSX.Element {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [seedDemo, setSeedDemo] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const timeoutRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const minPinLength = 4;

  function validate(): string | null {
    if (!pin || pin.trim().length === 0) return "Please enter an admin PIN.";
    if (pin.length < minPinLength) return `PIN must be at least ${minPinLength} digits/characters.`;
    if (pin !== confirm) return "PIN and confirmation do not match.";
    // Basic complexity hint: not all same char
    if (/^(\d)\1+$/.test(pin)) return "Please choose a less predictable PIN.";
    return null;
  }

  async function handleSubmit(e?: React.FormEvent) {
    if (e && e.preventDefault) e.preventDefault();
    setError(null);
    setSuccess(null);

    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    setLoading(true);
    try {
      await setAdminPin(pin);

      if (seedDemo) {
        await seedDemoData();
        // update admin record to mark that demo seeded
        try {
          const raw = localStorage.getItem(STORAGE_KEYS.ADMIN);
          if (raw) {
            const adminRec: AdminRecord = JSON.parse(raw);
            adminRec.seededDemo = true;
            localStorage.setItem(STORAGE_KEYS.ADMIN, JSON.stringify(adminRec));
          }
        } catch (innerErr) {
          console.error("Failed to mark admin record as demo-seeded:", innerErr);
          // don't fail the whole flow for this non-critical step
        }
      }

      if (isMountedRef.current) {
        setSuccess("Admin PIN saved successfully.");
        setPin("");
        setConfirm("");
      }

      // small delay to show success; guard setState with isMountedRef and clear on unmount
      timeoutRef.current = window.setTimeout(() => {
        if (!isMountedRef.current) return;
        setLoading(false);
        if (onComplete) {
          try {
            onComplete();
          } catch (cbErr) {
            console.error("onComplete callback threw an error:", cbErr);
          }
        }
      }, 500);
    } catch (err: any) {
      console.error("Error during admin setup:", err);
      if (isMountedRef.current) {
        setLoading(false);
        setError(
          err?.message ||
            "An error occurred while saving settings. Ensure your browser supports secure crypto and that local storage is available."
        );
      }
    }
  }

  const containerStyle: React.CSSProperties = {
    maxWidth: 520,
    margin: "16px auto",
    padding: 18,
    borderRadius: 10,
    background: "var(--card-bg, #fff)",
    boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 14,
    marginBottom: 6,
    color: "var(--muted, #333)",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #ddd",
    fontSize: 16,
    boxSizing: "border-box",
    marginBottom: 12,
  };

  const btnPrimary: React.CSSProperties = {
    padding: "10px 14px",
    background: "var(--primary, #0b76ef)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 16,
    cursor: "pointer",
  };

  const btnSecondary: React.CSSProperties = {
    padding: "10px 14px",
    background: "transparent",
    color: "var(--muted, #333)",
    border: "1px solid #ddd",
    borderRadius: 8,
    fontSize: 16,
    cursor: "pointer",
    marginLeft: 8,
  };

  return (
    <div style={containerStyle} role="region" aria-labelledby="admin-setup-title">
      <h2 id="admin-setup-title" style={{ marginTop: 0, marginBottom: 6 }}>
        Setup Admin PIN
      </h2>
      <p style={{ marginTop: 0, marginBottom: 14, color: "var(--muted, #444)" }}>
        Create a local admin PIN to secure access to this Photobooth Booking app. This PIN is hashed
        using a secure key-derivation function (PBKDF2) and stored locally in your browser's
        localStorage. Note: localStorage is accessible to scripts running in this origin ? do not
        reuse this PIN elsewhere. If your browser does not support the Web Crypto API, setup will
        not complete.
      </p>

      <form onSubmit={handleSubmit} aria-describedby="admin-setup-desc">
        <label style={labelStyle} htmlFor="admin-pin">
          Admin PIN
        </label>
        <input
          id="admin-pin"
          name="admin-pin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          style={inputStyle}
          aria-required
          minLength={minPinLength}
          disabled={loading}
        />

        <label style={labelStyle} htmlFor="admin-pin-confirm">
          Confirm PIN
        </label>
        <input
          id="admin-pin-confirm"
          name="admin-pin-confirm"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          style={inputStyle}
          aria-required
          disabled={loading}
        />

        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <input
            id="seed-demo"
            type="checkbox"
            checked={seedDemo}
            onChange={(e) => setSeedDemo(e.target.checked)}
            style={{ marginRight: 8 }}
            disabled={loading}
          />
          <label htmlFor="seed-demo" style={{ fontSize: 14, color: "var(--muted, #333)" }}>
            Seed demo data (sample bookings, customers, services)
          </label>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              marginBottom: 12,
              color: "#7a1f1f",
              background: "#fff0f0",
              padding: 10,
              borderRadius: 8,
              border: "1px solid #f2c2c2",
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            style={{
              marginBottom: 12,
              color: "#163a1a",
              background: "#f0fff4",
              padding: 10,
              borderRadius: 8,
              border: "1px solid #c8f7d1",
              fontSize: 14,
            }}
          >
            {success}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center" }}>
          <button
            type="submit"
            style={btnPrimary}
            disabled={loading}
            aria-disabled={loading}
            aria-live="polite"
          >
            {loading ? "Saving?" : "Save PIN & Finish"}
          </button>

          <button
            type="button"
            onClick={() => {
              // reset form
              setPin("");
              setConfirm("");
              setSeedDemo(true);
              setError(null);
              setSuccess(null);
            }}
            style={btnSecondary}
            aria-disabled={loading}
            disabled={loading}
          >
            Reset
          </button>
        </div>
      </form>

      <div style={{ marginTop: 14, fontSize: 13, color: "var(--muted, #666)" }}>
        <strong>Note:</strong> The PIN hash and demo data are stored only in this browser's
        localStorage. Clearing your browser data will remove them. For stronger protection, export a
        backup of your data and keep it in a secure location.
      </div>
    </div>
  );
}