const STORAGE_KEYS = {
  PAYMENT: "pb_payment_settings_v1",
  TEMPLATES: "pb_reminder_templates_v1",
};

const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  currency: "USD",
  depositPercent: 20,
  requireCard: true,
  taxPercent: 0,
  acceptedMethods: ["card"],
  provider: "manual",
};

const DEFAULT_REMINDER_TEMPLATES: ReminderTemplates = {
  confirmation:
    "Hi {{name}}, thanks for booking! Your booking is scheduled for {{date}} at {{time}}. Venue: {{location}}. Amount due: {{amount}}.",
  reminder24h:
    "Reminder: Hi {{name}} ? you have a photobooth booking tomorrow at {{time}} ({{date}}). Reply if you need to reschedule.",
  followup:
    "Thanks for having us, {{name}}! We hope you enjoyed your event on {{date}}. Leave a review or contact us for future bookings.",
};

function isLocalStorageAvailable(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

async function savePaymentSettings(settings: PaymentSettings): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      if (!isLocalStorageAvailable()) {
        // Still emulate async behavior in non-browser environments
        setTimeout(() => reject(new Error("localStorage not available")), 0);
        return;
      }
      const payload = JSON.stringify(settings);
      localStorage.setItem(STORAGE_KEYS.PAYMENT, payload);
      setTimeout(() => resolve(), 200);
    } catch (err) {
      reject(err);
    }
  });
}

async function saveReminderTemplates(templates: ReminderTemplates): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      if (!isLocalStorageAvailable()) {
        setTimeout(() => reject(new Error("localStorage not available")), 0);
        return;
      }
      const payload = JSON.stringify(templates);
      localStorage.setItem(STORAGE_KEYS.TEMPLATES, payload);
      setTimeout(() => resolve(), 200);
    } catch (err) {
      reject(err);
    }
  });
}

function loadPaymentSettings(): PaymentSettings {
  try {
    if (!isLocalStorageAvailable()) return DEFAULT_PAYMENT_SETTINGS;
    const raw = localStorage.getItem(STORAGE_KEYS.PAYMENT);
    if (!raw) return DEFAULT_PAYMENT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<PaymentSettings>;
    return { ...DEFAULT_PAYMENT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_PAYMENT_SETTINGS;
  }
}

function loadReminderTemplates(): ReminderTemplates {
  try {
    if (!isLocalStorageAvailable()) return DEFAULT_REMINDER_TEMPLATES;
    const raw = localStorage.getItem(STORAGE_KEYS.TEMPLATES);
    if (!raw) return DEFAULT_REMINDER_TEMPLATES;
    const parsed = JSON.parse(raw) as Partial<ReminderTemplates>;
    return { ...DEFAULT_REMINDER_TEMPLATES, ...parsed };
  } catch {
    return DEFAULT_REMINDER_TEMPLATES;
  }
}

function replaceTokens(template: string, sample: Record<string, string>) {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) =>
    sample[key] ?? `{{${key}}}`
  );
}

export default function SettingsPage(): JSX.Element {
  const [payment, setPayment] = useState<PaymentSettings>(() => loadPaymentSettings());
  const [templates, setTemplates] = useState<ReminderTemplates>(() => loadReminderTemplates());

  const [savingPayment, setSavingPayment] = useState(false);
  const [savingTemplates, setSavingTemplates] = useState(false);

  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const [templatesMessage, setTemplatesMessage] = useState<string | null>(null);

  const [paymentErrors, setPaymentErrors] = useState<string[]>([]);
  const [templatesErrors, setTemplatesErrors] = useState<string[]>([]);

  // Initialize initialRef with the current persisted state (or defaults).
  const initialRef = useRef({
    payment: JSON.stringify(loadPaymentSettings()),
    templates: JSON.stringify(loadReminderTemplates()),
  });

  // On mount, ensure initialRef reflects actual persisted values (in case localStorage becomes available only in client).
  useEffect(() => {
    initialRef.current.payment = JSON.stringify(loadPaymentSettings());
    initialRef.current.templates = JSON.stringify(loadReminderTemplates());
    // Also ensure state mirrors persisted values (in case component was hydrated differently)
    setPayment(loadPaymentSettings());
    setTemplates(loadReminderTemplates());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasUnsavedChanges =
    JSON.stringify(payment) !== initialRef.current.payment ||
    JSON.stringify(templates) !== initialRef.current.templates;

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!hasUnsavedChanges) return;
      e.preventDefault();
      e.returnValue = "";
      return "";
    }
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", handleBeforeUnload);
      return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }
    // no-op cleanup for SSR safety
    return;
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (paymentMessage) {
      const t = setTimeout(() => setPaymentMessage(null), 4000);
      return () => clearTimeout(t);
    }
  }, [paymentMessage]);

  useEffect(() => {
    if (templatesMessage) {
      const t = setTimeout(() => setTemplatesMessage(null), 4000);
      return () => clearTimeout(t);
    }
  }, [templatesMessage]);

  function validatePayment(p: PaymentSettings) {
    const errs: string[] = [];
    if (!p.currency || typeof p.currency !== "string") errs.push("Currency is required.");
    if (isNaN(p.depositPercent) || p.depositPercent < 0 || p.depositPercent > 100)
      errs.push("Deposit percentage must be between 0 and 100.");
    if (isNaN(p.taxPercent) || p.taxPercent < 0 || p.taxPercent > 100)
      errs.push("Tax percentage must be between 0 and 100.");
    if (!Array.isArray(p.acceptedMethods) || p.acceptedMethods.length === 0)
      errs.push("At least one accepted payment method must be selected.");
    if (!["manual", "stripe", "square"].includes(p.provider))
      errs.push("Payment provider is invalid.");
    return errs;
  }

  function validateTemplates(t: ReminderTemplates) {
    const errs: string[] = [];
    if (!t.confirmation || t.confirmation.trim().length < 10)
      errs.push("Confirmation template must be at least 10 characters.");
    if (!t.reminder24h || t.reminder24h.trim().length < 10)
      errs.push("24-hour reminder template must be at least 10 characters.");
    if (!t.followup || t.followup.trim().length < 5)
      errs.push("Follow-up template must be at least 5 characters.");
    return errs;
  }

  async function handleSavePayment(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setPaymentErrors([]);
    const errs = validatePayment(payment);
    if (errs.length) {
      setPaymentErrors(errs);
      setPaymentMessage(null);
      return;
    }
    setSavingPayment(true);
    setPaymentMessage(null);
    try {
      await savePaymentSettings(payment);
      initialRef.current.payment = JSON.stringify(payment);
      setPaymentMessage("Payment settings saved.");
      setPaymentErrors([]);
    } catch (err) {
      setPaymentMessage("Failed to save payment settings.");
    } finally {
      setSavingPayment(false);
    }
  }

  async function handleSaveTemplates(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setTemplatesErrors([]);
    const errs = validateTemplates(templates);
    if (errs.length) {
      setTemplatesErrors(errs);
      setTemplatesMessage(null);
      return;
    }
    setSavingTemplates(true);
    setTemplatesMessage(null);
    try {
      await saveReminderTemplates(templates);
      initialRef.current.templates = JSON.stringify(templates);
      setTemplatesMessage("Reminder templates saved.");
      setTemplatesErrors([]);
    } catch {
      setTemplatesMessage("Failed to save reminder templates.");
    } finally {
      setSavingTemplates(false);
    }
  }

  async function handleSaveAll() {
    // Validate both
    setPaymentErrors([]);
    setTemplatesErrors([]);
    const pErrs = validatePayment(payment);
    const tErrs = validateTemplates(templates);
    if (pErrs.length || tErrs.length) {
      if (pErrs.length) setPaymentErrors(pErrs);
      if (tErrs.length) setTemplatesErrors(tErrs);
      setPaymentMessage(null);
      setTemplatesMessage(null);
      return;
    }

    setSavingPayment(true);
    setSavingTemplates(true);
    setPaymentMessage(null);
    setTemplatesMessage(null);

    const pPromise = savePaymentSettings(payment);
    const tPromise = saveReminderTemplates(templates);

    const results = await Promise.allSettled([pPromise, tPromise]);

    const [pResult, tResult] = results;

    if (pResult.status === "fulfilled") {
      initialRef.current.payment = JSON.stringify(payment);
      setPaymentMessage("Payment settings saved.");
      setPaymentErrors([]);
    } else {
      setPaymentMessage("Failed to save payment settings.");
    }

    if (tResult.status === "fulfilled") {
      initialRef.current.templates = JSON.stringify(templates);
      setTemplatesMessage("Reminder templates saved.");
      setTemplatesErrors([]);
    } else {
      setTemplatesMessage("Failed to save reminder templates.");
    }

    setSavingPayment(false);
    setSavingTemplates(false);
  }

  function restorePaymentDefaults() {
    setPayment(DEFAULT_PAYMENT_SETTINGS);
  }

  function restoreTemplateDefaults() {
    setTemplates(DEFAULT_REMINDER_TEMPLATES);
  }

  const sample = {
    name: "Alex",
    date: "2025-09-01",
    time: "6:30 PM",
    location: "Main Hall",
    amount: "$150",
  };

  function toggleMethod(method: string) {
    setPayment((prev) => {
      const set = new Set(prev.acceptedMethods);
      if (set.has(method)) set.delete(method);
      else set.add(method);
      return { ...prev, acceptedMethods: Array.from(set) };
    });
  }

  return (
    <main
      aria-labelledby="settings-heading"
      style={{
        padding: "1rem",
        maxWidth: 900,
        margin: "0 auto",
        fontFamily:
          "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial",
        color: "var(--text-color, #111)",
      }}
    >
      <h1 id="settings-heading" style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
        Settings
      </h1>
      <p style={{ marginTop: 0, marginBottom: "1rem", color: "var(--muted,#555)" }}>
        Configure payment preferences and reminder message templates. Changes are saved
        to your browser.
      </p>

      <section
        aria-labelledby="payment-settings-heading"
        style={{
          marginBottom: "1.5rem",
          background: "var(--card-bg,#fff)",
          padding: "1rem",
          borderRadius: 8,
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <h2 id="payment-settings-heading" style={{ margin: 0, fontSize: "1.125rem" }}>
            Payment Settings
          </h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              onClick={restorePaymentDefaults}
              aria-label="Restore default payment settings"
              style={{
                fontSize: 13,
                padding: "6px 10px",
                background: "transparent",
                border: "1px solid var(--muted,#ccc)",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Restore defaults
            </button>
            <button
              type="button"
              onClick={handleSavePayment}
              disabled={savingPayment}
              aria-disabled={savingPayment}
              style={{
                fontSize: 13,
                padding: "6px 10px",
                background: savingPayment ? "var(--muted,#ddd)" : "var(--primary,#007bff)",
                color: savingPayment ? "#333" : "#fff",
                border: "none",
                borderRadius: 6,
                cursor: savingPayment ? "default" : "pointer",
              }}
            >
              {savingPayment ? "Saving?" : "Save"}
            </button>
          </div>
        </div>

        <form onSubmit={handleSavePayment} aria-describedby="payment-note" style={{ marginTop: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", fontSize: 13 }}>
              Currency
              <input
                name="currency"
                value={payment.currency}
                onChange={(e) => setPayment({ ...payment, currency: e.target.value })}
                style={{ marginTop: 6, padding: "8px 10px", borderRadius: 6, border: "1px solid #ccc" }}
                aria-label="Currency"
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", fontSize: 13 }}>
              Provider
              <select
                value={payment.provider}
                onChange={(e) =>
                  setPayment({
                    ...payment,
                    provider: e.target.value as PaymentSettings["provider"],
                  })
                }
                style={{ marginTop: 6, padding: "8px 10px", borderRadius: 6, border: "1px solid #ccc" }}
                aria-label="Payment provider"
              >
                <option value="manual">Manual / other</option>
                <option value="stripe">Stripe</option>
                <option value="square">Square</option>
              </select>
            </label>

            <label style={{ display: "flex", flexDirection: "column", fontSize: 13 }}>
              Deposit percent (%)
              <input
                type="number"
                min={0}
                max={100}
                value={payment.depositPercent}
                onChange={(e) =>
                  setPayment({ ...payment, depositPercent: Number(e.target.value) || 0 })
                }
                style={{ marginTop: 6, padding: "8px 10px", borderRadius: 6, border: "1px solid #ccc" }}
                aria-label="Deposit percent"
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", fontSize: 13 }}>
              Tax percent (%)
              <input
                type="number"
                min={0}
                max={100}
                value={payment.taxPercent}
                onChange={(e) => setPayment({ ...payment, taxPercent: Number(e.target.value) || 0 })}
                style={{ marginTop: 6, padding: "8px 10px", borderRadius: 6, border: "1px solid #ccc" }}
                aria-label="Tax percent"
              />
            </label>
          </div>

          <fieldset style={{ marginTop: 12, border: "none", padding: 0 }}>
            <legend style={{ fontSize: 13, marginBottom: 6 }}>Accepted payment methods</legend>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { id: "card", label: "Card" },
                { id: "cash", label: "Cash" },
                { id: "invoice", label: "Invoice" },
              ].map((m) => (
                <label
                  key={m.id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 8px",
                    borderRadius: 6,
                    border: "1px solid #ddd",
                    cursor: "pointer",
                    background: payment.acceptedMethods.includes(m.id) ? "var(--primary,#e6f0ff)" : "transparent",
                    fontSize: 13,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={payment.acceptedMethods.includes(m.id)}
                    onChange={() => toggleMethod(m.id)}
                    aria-checked={payment.acceptedMethods.includes(m.id)}
                    style={{ width: 16, height: 16 }}
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </fieldset>

          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <input
              type="checkbox"
              checked={payment.requireCard}
              onChange={(e) => setPayment({ ...payment, requireCard: e.target.checked })}
              aria-checked={payment.requireCard}
            />
            <span style={{ fontSize: 13 }}>Require card at booking</span>
          </label>

          <div id="payment-note" style={{ marginTop: 10, color: "var(--muted,#666)", fontSize: 13 }}>
            Tip: When using a provider (Stripe/Square) you can record card details. This app stores
            only configuration and templates locally ? no external APIs are called.
          </div>

          {paymentErrors.length > 0 && (
            <div aria-live="assertive" style={{ marginTop: 10 }}>
              <ul style={{ color: "var(--danger,#b00020)", paddingLeft: 18, margin: 0 }}>
                {paymentErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {paymentMessage && (
            <div
              role="status"
              aria-live="polite"
              style={{
                marginTop: 10,
                color: paymentMessage.includes("Failed") ? "var(--danger,#b00020)" : "var(--success,#006400)",
                fontSize: 13,
              }}
            >
              {paymentMessage}
            </div>
          )}
        </form>
      </section>

      <section
        aria-labelledby="templates-heading"
        style={{
          marginBottom: "2rem",
          background: "var(--card-bg,#fff)",
          padding: "1rem",
          borderRadius: 8,
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <h2 id="templates-heading" style={{ margin: 0, fontSize: "1.125rem" }}>
            Reminder & Message Templates
          </h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={restoreTemplateDefaults}
              aria-label="Restore default templates"
              style={{
                fontSize: 13,
                padding: "6px 10px",
                background: "transparent",
                border: "1px solid var(--muted,#ccc)",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Restore defaults
            </button>
            <button
              type="button"
              onClick={handleSaveTemplates}
              disabled={savingTemplates}
              aria-disabled={savingTemplates}
              style={{
                fontSize: 13,
                padding: "6px 10px",
                background: savingTemplates ? "var(--muted,#ddd)" : "var(--primary,#007bff)",
                color: savingTemplates ? "#333" : "#fff",
                border: "none",
                borderRadius: 6,
                cursor: savingTemplates ? "default" : "pointer",
              }}
            >
              {savingTemplates ? "Saving?" : "Save"}
            </button>
          </div>
        </div>

        <form onSubmit={handleSaveTemplates} style={{ marginTop: 12 }}>
          <div style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", fontSize: 13 }}>
              Confirmation message
              <textarea
                value={templates.confirmation}
                onChange={(e) => setTemplates({ ...templates, confirmation: e.target.value })}
                rows={3}
                style={{ marginTop: 6, padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
                aria-label="Confirmation message template"
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", fontSize: 13 }}>
              24-hour reminder
              <textarea
                value={templates.reminder24h}
                onChange={(e) => setTemplates({ ...templates, reminder24h: e.target.value })}
                rows={2}
                style={{ marginTop: 6, padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
                aria-label="24 hour reminder template"
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", fontSize: 13 }}>
              Follow-up message
              <textarea
                value={templates.followup}
                onChange={(e) => setTemplates({ ...templates, followup: e.target.value })}
                rows={2}
                style={{ marginTop: 6, padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
                aria-label="Follow up message template"
              />
            </label>
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, color: "var(--muted,#666)" }}>
              Use placeholders:{" "}
              <code style={{ background: "#f5f5f5", padding: "2px 6px", borderRadius: 4 }}>
                {"{{name}}"}
              </code>{" "}
              <code style={{ background: "#f5f5f5", padding: "2px 6px", borderRadius: 4 }}>
                {"{{date}}"}
              </code>{" "}
              <code style={{ background: "#f5f5f5", padding: "2px 6px", borderRadius: 4 }}>
                {"{{time}}"}
              </code>{" "}
              <code style={{ background: "#f5f5f5", padding: "2px 6px", borderRadius: 4 }}>
                {"{{location}}"}
              </code>{" "}
              <code style={{ background: "#f5f5f5", padding: "2px 6px", borderRadius: 4 }}>
                {"{{amount}}"}
              </code>
            </div>
          </div>

          {templatesErrors.length > 0 && (
            <div aria-live="assertive" style={{ marginTop: 10 }}>
              <ul style={{ color: "var(--danger,#b00020)", paddingLeft: 18, margin: 0 }}>
                {templatesErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {templatesMessage && (
            <div
              role="status"
              aria-live="polite"
              style={{
                marginTop: 10,
                color: templatesMessage.includes("Failed") ? "var(--danger,#b00020)" : "var(--success,#006400)",
                fontSize: 13,
              }}
            >
              {templatesMessage}
            </div>
          )}
        </form>

        <div style={{ marginTop: 14 }}>
          <h3 style={{ margin: "0 0 8px 0", fontSize: 14 }}>Preview</h3>
          <div
            aria-live="polite"
            style={{
              background: "#fafafa",
              padding: 12,
              borderRadius: 8,
              border: "1px solid #eee",
              display: "grid",
              gap: 8,
            }}
          >
            <div>
              <strong style={{ display: "block", fontSize: 13 }}>Confirmation</strong>
              <div style={{ marginTop: 6, fontSize: 13 }}>
                {replaceTokens(templates.confirmation, sample)}
              </div>
            </div>

            <div>
              <strong style={{ display: "block", fontSize: 13 }}>24-hour reminder</strong>
              <div style={{ marginTop: 6, fontSize: 13 }}>
                {replaceTokens(templates.reminder24h, sample)}
              </div>
            </div>

            <div>
              <strong style={{ display: "block", fontSize: 13 }}>Follow-up</strong>
              <div style={{ marginTop: 6, fontSize: 13 }}>
                {replaceTokens(templates.followup, sample)}
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, color: "var(--muted,#666)" }}>
          {hasUnsavedChanges ? "You have unsaved changes." : "All changes saved."}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={savingPayment || savingTemplates}
            style={{
              fontSize: 13,
              padding: "8px 12px",
              background: "var(--primary,#007bff)",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: savingPayment || savingTemplates ? "default" : "pointer",
            }}
            aria-disabled={savingPayment || savingTemplates}
          >
            {savingPayment || savingTemplates ? "Saving?" : "Save all"}
          </button>

          <button
            type="button"
            onClick={() => {
              // reset to last saved (from storage)
              const persistedPayment = loadPaymentSettings();
              const persistedTemplates = loadReminderTemplates();
              setPayment(persistedPayment);
              setTemplates(persistedTemplates);
              initialRef.current.payment = JSON.stringify(persistedPayment);
              initialRef.current.templates = JSON.stringify(persistedTemplates);
            }}
            style={{
              fontSize: 13,
              padding: "8px 12px",
              background: "transparent",
              color: "var(--muted,#333)",
              border: "1px solid #ddd",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Revert
          </button>
        </div>
      </footer>
    </main>
  );
}

export { savePaymentSettings, saveReminderTemplates };