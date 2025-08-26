const STORAGE_KEY = "photobooth_booking_draft_v2";

const PACKAGE_OPTIONS: PackageOption[] = [
  { id: "basic", label: "Basic", pricePerHour: 120, description: "2 props, 1 backdrop" },
  { id: "standard", label: "Standard", pricePerHour: 180, description: "4 props, 2 backdrops" },
  { id: "premium", label: "Premium", pricePerHour: 250, description: "Unlimited prints, premium props" },
];

const ADDONS: Addon[] = [
  { id: "guestbook", label: "Guestbook", price: 75 },
  { id: "attendant", label: "On-site Attendant", price: 100 },
  { id: "usb", label: "USB Drive of Photos", price: 45 },
];

function isValidEmail(email: string) {
  return /^\S+@\S+\.\S+$/.test(email);
}

function isValidPhone(phone: string) {
  // Loose validation: digits, spaces, +, -, parentheses
  return /^[\d+\-\s()]{7,20}$/.test(phone);
}

function todayYYYYMMDD(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function validateBookingForm(data: Partial<BookingDraft>): string[] {
  const errors: string[] = [];

  if (!data.fullName || !data.fullName.trim()) {
    errors.push("Full name is required.");
  } else if (data.fullName.trim().length < 2) {
    errors.push("Full name must be at least 2 characters.");
  }

  if (!data.email || !data.email.trim()) {
    errors.push("Email is required.");
  } else if (!isValidEmail(data.email.trim())) {
    errors.push("Please enter a valid email address.");
  }

  if (!data.phone || !data.phone.trim()) {
    errors.push("Phone number is required.");
  } else if (!isValidPhone(data.phone.trim())) {
    errors.push("Please enter a valid phone number.");
  }

  if (!data.date) {
    errors.push("Date is required.");
  } else {
    const selected = new Date(data.date + "T00:00:00");
    const minDate = new Date(todayYYYYMMDD() + "T00:00:00");
    if (isNaN(selected.getTime())) {
      errors.push("Please select a valid date.");
    } else if (selected < minDate) {
      errors.push("Date must not be in the past.");
    }
  }

  if (!data.time) {
    errors.push("Time is required.");
  } else {
    // basic HH:MM validation
    if (!/^\d{2}:\d{2}$/.test(data.time)) {
      errors.push("Please provide time in HH:MM format.");
    } else {
      const [hhStr, mmStr] = data.time.split(":");
      const hh = parseInt(hhStr, 10);
      const mm = parseInt(mmStr, 10);
      if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {
        errors.push("Please provide a valid time.");
      }
    }
  }

  if (!data.packageId) {
    errors.push("Please select a package.");
  } else {
    const found = PACKAGE_OPTIONS.find((p) => p.id === data.packageId);
    if (!found) errors.push("Selected package is invalid.");
  }

  if (data.hours == null || data.hours === undefined) {
    errors.push("Please specify the number of hours.");
  } else {
    const h = Number(data.hours);
    if (!Number.isInteger(h) || h < 1 || h > 12) {
      errors.push("Hours must be a whole number between 1 and 12.");
    }
  }

  if (!data.agreeToTerms) {
    errors.push("You must agree to the terms and conditions.");
  }

  return errors;
}

export function proceedToSummary(draft: BookingDraft, navigate?: (path: string) => void) {
  try {
    const toStore = {
      ...draft,
      createdAt: new Date().toISOString(),
    };
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    }
  } catch (err) {
    console.warn("Unable to save booking draft to localStorage:", err);
  }

  // Prefer react-router navigation if provided
  if (navigate) {
    try {
      navigate("/summary");
      return;
    } catch {
      // fall through
    }
  }

  // Fallbacks
  if (typeof window !== "undefined") {
    // If running inside SPA, attempt a hash route fallback
    if (window.location.pathname !== "/summary") {
      // try pushState
      try {
        window.history.pushState({}, "", "/summary");
        // notify application that route changed (some routers may listen)
        window.dispatchEvent(new PopStateEvent("popstate"));
        return;
      } catch {
        // last resort: full navigation
        window.location.href = "/summary";
      }
    }
  }
}

const defaultDraft: BookingDraft = {
  fullName: "",
  email: "",
  phone: "",
  date: "",
  time: "",
  packageId: PACKAGE_OPTIONS[1].id, // default to standard
  hours: 2,
  addons: [],
  notes: "",
  agreeToTerms: false,
};

export default function BookingPage(): JSX.Element {
  const navigate = useNavigate();

  const [draft, setDraft] = useState<BookingDraft>(() => {
    if (typeof window === "undefined") {
      return defaultDraft;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<BookingDraft>;
        return { ...defaultDraft, ...parsed };
      }
    } catch {
      // ignore parse errors
    }
    return defaultDraft;
  });

  const [errors, setErrors] = useState<string[]>([]);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // refs to manage timers for auto-save and hide message
  const saveTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    // auto-save on change (debounced)
    // clear any pending timers first
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    saveTimerRef.current = window.setTimeout(() => {
      try {
        if (typeof window !== "undefined") {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
        }
        setSaveMessage("Draft saved");
        hideTimerRef.current = window.setTimeout(() => {
          setSaveMessage(null);
          hideTimerRef.current = null;
        }, 1200);
      } catch {
        // ignore
      } finally {
        saveTimerRef.current = null;
      }
    }, 700);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [draft]);

  const packageSelected = useMemo(
    () => PACKAGE_OPTIONS.find((p) => p.id === draft.packageId) ?? PACKAGE_OPTIONS[1],
    [draft.packageId]
  );

  function update<K extends keyof BookingDraft>(key: K, value: BookingDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function toggleAddon(addonId: string) {
    setDraft((prev) => {
      const has = prev.addons.includes(addonId);
      return {
        ...prev,
        addons: has ? prev.addons.filter((a) => a !== addonId) : [...prev.addons, addonId],
      };
    });
  }

  // Derived per-field validation booleans (avoid brittle string matching)
  const fieldInvalid = useMemo(() => {
    const fi: Record<string, boolean> = {
      fullName: false,
      email: false,
      phone: false,
      date: false,
      time: false,
      hours: false,
      agreeToTerms: false,
    };

    // full name
    if (!draft.fullName || !draft.fullName.trim() || draft.fullName.trim().length < 2) {
      fi.fullName = true;
    }

    // email
    if (!draft.email || !draft.email.trim() || !isValidEmail(draft.email.trim())) {
      fi.email = true;
    }

    // phone
    if (!draft.phone || !draft.phone.trim() || !isValidPhone(draft.phone.trim())) {
      fi.phone = true;
    }

    // date
    if (!draft.date) {
      fi.date = true;
    } else {
      const selected = new Date(draft.date + "T00:00:00");
      const minDate = new Date(todayYYYYMMDD() + "T00:00:00");
      if (isNaN(selected.getTime()) || selected < minDate) fi.date = true;
    }

    // time
    if (!draft.time) {
      fi.time = true;
    } else {
      if (!/^\d{2}:\d{2}$/.test(draft.time)) fi.time = true;
      else {
        const [hhStr, mmStr] = draft.time.split(":");
        const hh = parseInt(hhStr, 10);
        const mm = parseInt(mmStr, 10);
        if (hh < 0 || hh > 23 || mm < 0 || mm > 59) fi.time = true;
      }
    }

    // hours
    if (draft.hours == null || draft.hours === undefined) {
      fi.hours = true;
    } else {
      const h = Number(draft.hours);
      if (!Number.isInteger(h) || h < 1 || h > 12) fi.hours = true;
    }

    // terms
    if (!draft.agreeToTerms) fi.agreeToTerms = true;

    return fi;
  }, [draft]);

  function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const vErrors = validateBookingForm(draft);
    setErrors(vErrors);
    if (vErrors.length === 0) {
      proceedToSummary(draft, (path: string) => navigate(path));
    } else {
      // focus the first field that is actually invalid (using our structured map)
      const fieldOrder = [
        { name: "fullName", selector: "#fullName" },
        { name: "email", selector: "#email" },
        { name: "phone", selector: "#phone" },
        { name: "date", selector: "#date" },
        { name: "time", selector: "#time" },
        { name: "hours", selector: "#hours" },
        { name: "agreeToTerms", selector: "#agreeToTerms" },
      ];
      let focused = false;
      for (const f of fieldOrder) {
        if ((fieldInvalid as any)[f.name]) {
          const el = document.querySelector(f.selector);
          if (el instanceof HTMLElement) {
            el.focus();
            focused = true;
            break;
          }
        }
      }
      if (!focused) {
        // fallback: focus first form error region
        const firstEl = document.querySelector("[aria-invalid='true']");
        if (firstEl instanceof HTMLElement) firstEl.focus();
      }

      // scroll to top of form for mobile if available
      if (typeof window !== "undefined" && window.scrollTo) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  }

  function handleSaveDraft(e?: React.MouseEvent) {
    if (e) e.preventDefault();
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ ...draft, createdAt: new Date().toISOString() })
        );
      }
      setSaveMessage("Draft saved");
      window.setTimeout(() => setSaveMessage(null), 1200);
    } catch {
      setSaveMessage("Unable to save draft");
      window.setTimeout(() => setSaveMessage(null), 2000);
    }
  }

  return (
    <main className="booking-page container" aria-labelledby="booking-heading">
      <h1 id="booking-heading" className="sr-only">
        Book a Photobooth
      </h1>

      <form className="booking-form" onSubmit={handleSubmit} noValidate>
        <div role="status" aria-live="polite" className="status-line">
          {saveMessage && <div className="save-message">{saveMessage}</div>}
        </div>

        {errors.length > 0 && (
          <div className="form-errors" tabIndex={-1} aria-live="assertive">
            <strong>
              There {errors.length === 1 ? "is" : "are"} {errors.length} problem
              {errors.length === 1 ? "" : "s"} with your submission:
            </strong>
            <ul>
              {errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        <fieldset className="personal-fieldset">
          <legend>Contact information</legend>

          <label htmlFor="fullName">
            Full name
            <input
              id="fullName"
              name="fullName"
              type="text"
              value={draft.fullName}
              onChange={(e) => update("fullName", e.target.value)}
              required
              aria-invalid={fieldInvalid.fullName}
            />
          </label>

          <label htmlFor="email">
            Email
            <input
              id="email"
              name="email"
              type="email"
              value={draft.email}
              onChange={(e) => update("email", e.target.value)}
              required
              aria-invalid={fieldInvalid.email}
            />
          </label>

          <label htmlFor="phone">
            Phone
            <input
              id="phone"
              name="phone"
              type="tel"
              value={draft.phone}
              onChange={(e) => update("phone", e.target.value)}
              required
              aria-invalid={fieldInvalid.phone}
            />
          </label>
        </fieldset>

        <fieldset className="time-fieldset">
          <legend>Event date & time</legend>

          <label htmlFor="date">
            Date
            <input
              id="date"
              name="date"
              type="date"
              value={draft.date}
              onChange={(e) => update("date", e.target.value)}
              min={todayYYYYMMDD()}
              required
              aria-invalid={fieldInvalid.date}
            />
          </label>

          <label htmlFor="time">
            Time
            <input
              id="time"
              name="time"
              type="time"
              value={draft.time}
              onChange={(e) => update("time", e.target.value)}
              required
              aria-invalid={fieldInvalid.time}
            />
          </label>

          <label htmlFor="hours">
            Hours
            <input
              id="hours"
              name="hours"
              type="number"
              min={1}
              max={12}
              value={String(draft.hours)}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (Number.isNaN(val)) update("hours", 1);
                else update("hours", Math.max(1, Math.min(12, Math.floor(val))));
              }}
              required
              aria-invalid={fieldInvalid.hours}
            />
          </label>
        </fieldset>

        <fieldset className="package-fieldset">
          <legend>Package</legend>
          {PACKAGE_OPTIONS.map((pkg) => (
            <label key={pkg.id} className="package-option">
              <input
                type="radio"
                name="packageId"
                value={pkg.id}
                checked={draft.packageId === pkg.id}
                onChange={() => update("packageId", pkg.id)}
                aria-checked={draft.packageId === pkg.id}
              />
              <div className="package-meta">
                <div className="package-label">{pkg.label}</div>
                <div className="package-desc">{pkg.description}</div>
                <div className="package-price">${pkg.pricePerHour}/hr</div>
              </div>
            </label>
          ))}
        </fieldset>

        <fieldset className="addons-fieldset">
          <legend>Add-ons</legend>
          {ADDONS.map((a) => (
            <label key={a.id} className="addon-option">
              <input
                type="checkbox"
                name="addons"
                value={a.id}
                checked={draft.addons.includes(a.id)}
                onChange={() => toggleAddon(a.id)}
              />
              <span>{a.label} (+${a.price})</span>
            </label>
          ))}
        </fieldset>

        <label htmlFor="notes">
          Notes (optional)
          <textarea
            id="notes"
            name="notes"
            value={draft.notes}
            onChange={(e) => update("notes", e.target.value)}
            rows={4}
            placeholder="Tell us about venue, parking, setup notes..."
          />
        </label>

        <label className="terms-checkbox" htmlFor="agreeToTerms">
          <input
            id="agreeToTerms"
            name="agreeToTerms"
            type="checkbox"
            checked={draft.agreeToTerms}
            onChange={(e) => update("agreeToTerms", e.target.checked)}
            aria-invalid={fieldInvalid.agreeToTerms}
          />
          <span>I agree to the terms and conditions</span>
        </label>

        <div className="summary-line" aria-hidden={false}>
          <div className="estimates">
            <strong>Estimate:</strong>{" "}
            <span>
              ${(() => {
                const addonTotal = draft.addons.reduce((sum, id) => {
                  const a = ADDONS.find((x) => x.id === id);
                  return sum + (a ? a.price : 0);
                }, 0);
                const pkg = PACKAGE_OPTIONS.find((p) => p.id === draft.packageId) ?? PACKAGE_OPTIONS[1];
                const total = pkg.pricePerHour * (draft.hours || 0) + addonTotal;
                return total.toFixed(2);
              })()}
            </span>
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn primary">
            Continue to Summary
          </button>
          <button type="button" className="btn secondary" onClick={handleSaveDraft}>
            Save Draft
          </button>
        </div>
      </form>

      <style jsx>{`
        /* Mobile-first simple styles for accessibility and spacing */
        .container {
          padding: 16px;
          max-width: 800px;
          margin: 0 auto;
        }
        .booking-form {
          display: grid;
          gap: 12px;
        }
        fieldset {
          border: 1px solid var(--border, #e5e7eb);
          padding: 12px;
          border-radius: 8px;
        }
        label {
          display: block;
          font-size: 14px;
          margin-bottom: 8px;
        }
        input[type="text"],
        input[type="email"],
        input[type="tel"],
        input[type="date"],
        input[type="time"],
        input[type="number"],
        textarea {
          width: 100%;
          padding: 8px;
          border-radius: 6px;
          border: 1px solid var(--border, #d1d5db);
          font-size: 16px;
        }
        .package-option,
        .addon-option {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 0;
        }
        .package-meta {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .form-actions {
          display: flex;
          gap: 8px;
          margin-top: 6px;
        }
        .btn {
          padding: 10px 14px;
          border-radius: 8px;
          border: none;
          font-size: 16px;
          cursor: pointer;
        }
        .btn.primary {
          background: var(--primary, #0f62fe);
          color: white;
        }
        .btn.secondary {
          background: transparent;
          border: 1px solid var(--border, #d1d5db);
        }
        .form-errors {
          background: #fff1f0;
          color: #9f1239;
          padding: 10px;
          border-radius: 6px;
        }
        .status-line {
          min-height: 1.4em;
        }
        .save-message {
          background: #ecfdf5;
          color: #065f46;
          padding: 6px 10px;
          border-radius: 6px;
          display: inline-block;
        }
        @media (min-width: 640px) {
          .time-fieldset {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
          }
          .personal-fieldset {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
          }
        }
      `}</style>
    </main>
  );
}