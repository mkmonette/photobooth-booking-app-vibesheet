const STORAGE_KEY = "paymentInstructions";
const MAX_LENGTH = 1000;

/**
 * Component props
 */
export interface Props {
  initialText?: string;
  onSave?: (text: string) => Promise<void> | void;
}

/**
 * Validate instructions text.
 * Returns null if valid, otherwise returns a human-readable error string.
 */
export function validateInstructions(text: string): string | null {
  if (text == null) return "Payment instructions are required.";
  const trimmed = text.trim();
  if (trimmed.length === 0) return "Please enter payment instructions.";
  if (trimmed.length > MAX_LENGTH)
    return `Payment instructions must be ${MAX_LENGTH} characters or fewer.`;
  // Disallow obvious HTML/script tags to avoid accidental markup injection.
  const lowered = trimmed.toLowerCase();
  if (lowered.includes("<script") || lowered.includes("</script>"))
    return "Please do not include script tags in the instructions.";
  // Prevent javascript: pseudo-protocol in links
  if (lowered.includes("javascript:")) return "Please do not include JavaScript links.";
  return null;
}

/**
 * Save instructions to persistent storage.
 * If an onSave handler is provided to the component this function will not be used by the component.
 * This function exports a fallback implementation that writes to localStorage.
 */
export async function saveInstructions(text: string): Promise<void> {
  try {
    // Persist as raw string; keep simple so it can be easily read and edited.
    localStorage.setItem(STORAGE_KEY, text);
    return Promise.resolve();
  } catch (err) {
    return Promise.reject(err);
  }
}

export default function PaymentInstructionsEditor({ initialText, onSave }: Props): JSX.Element {
  const [text, setText] = useState<string>(() => {
    if (typeof initialText === "string") return initialText;
    try {
      return localStorage.getItem(STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });

  // Validation state: keep the latest validation result but control when it is shown to avoid
  // displaying errors on first render. showValidation becomes true after user input or an attempted save.
  const [error, setError] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState<boolean>(false);

  const [saving, setSaving] = useState<boolean>(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [dirty, setDirty] = useState<boolean>(false);

  const initialRef = useRef<string>(initialText ?? text);
  const mountedRef = useRef<boolean>(true);
  const successTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (successTimeoutRef.current !== null) {
        window.clearTimeout(successTimeoutRef.current);
        successTimeoutRef.current = null;
      }
    };
  }, []);

  // Reflect changes to initialText from parent if user hasn't edited.
  useEffect(() => {
    if (initialText !== undefined && !dirty) {
      setText(initialText);
      initialRef.current = initialText;
      // Update internal validation result but don't immediately show validation messages.
      setError(validateInstructions(initialText));
      setShowValidation(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialText]);

  const handleChange = (value: string) => {
    setText(value);
    setDirty(value !== (initialRef.current ?? ""));
    const validation = validateInstructions(value);
    setError(validation);
    if (!showValidation) setShowValidation(true);
    if (success) {
      setSuccess(null);
      if (successTimeoutRef.current !== null) {
        window.clearTimeout(successTimeoutRef.current);
        successTimeoutRef.current = null;
      }
    }
  };

  const handleReset = () => {
    const base = initialRef.current ?? "";
    setText(base);
    setError(validateInstructions(base));
    setDirty(false);
    setSuccess(null);
    setShowValidation(false);
    if (successTimeoutRef.current !== null) {
      window.clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = null;
    }
  };

  const performSave = async (value: string) => {
    if (onSave) {
      // support sync or async onSave
      await Promise.resolve(onSave(value));
    } else {
      await saveInstructions(value);
    }
  };

  const handleSave = async () => {
    setShowValidation(true);
    const validation = validateInstructions(text);
    setError(validation);
    if (validation) return;

    setSaving(true);
    setError(null);
    try {
      await performSave(text);
      if (!mountedRef.current) return;
      initialRef.current = text;
      setDirty(false);
      setSuccess("Payment instructions saved.");
      // clear any existing timeout first
      if (successTimeoutRef.current !== null) {
        window.clearTimeout(successTimeoutRef.current);
        successTimeoutRef.current = null;
      }
      successTimeoutRef.current = window.setTimeout(() => {
        if (mountedRef.current) setSuccess(null);
        successTimeoutRef.current = null;
      }, 3000);
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as any).message)
          : "Failed to save payment instructions.";
      if (mountedRef.current) setError(message);
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Save on Ctrl+Enter or Cmd+Enter
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      if (!saving && dirty) handleSave();
    }
  };

  // Determine the error message that should be visible to the user.
  const visibleError = showValidation ? error : null;
  const hasValidationError = !!error;

  return (
    <div className="payment-instructions-editor" aria-live="polite">
      <label
        htmlFor="payment-instructions-textarea"
        className="pi-label"
        style={{ display: "block", fontWeight: 600, marginBottom: 6 }}
      >
        Payment instructions
      </label>
      <textarea
        id="payment-instructions-textarea"
        ref={textareaRef}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={6}
        maxLength={MAX_LENGTH}
        aria-invalid={visibleError ? "true" : "false"}
        aria-describedby={visibleError ? "payment-instructions-error" : success ? "payment-instructions-success" : undefined}
        placeholder="e.g. Accepted payment methods, invoice details, deadlines, etc."
        style={{
          width: "100%",
          padding: 10,
          borderRadius: 8,
          border: visibleError ? "1px solid #d9534f" : "1px solid #ccc",
          fontSize: 15,
          lineHeight: 1.4,
          resize: "vertical",
          minHeight: 120,
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || hasValidationError || !dirty}
            aria-disabled={saving || hasValidationError || !dirty}
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              border: "none",
              backgroundColor: saving || hasValidationError || !dirty ? "#bbb" : "#1976d2",
              color: "#fff",
              cursor: saving || hasValidationError || !dirty ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving?" : "Save"}
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={saving || !dirty}
            aria-disabled={saving || !dirty}
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid #ccc",
              backgroundColor: "#fff",
              color: "#333",
              cursor: saving || !dirty ? "not-allowed" : "pointer",
            }}
          >
            Reset
          </button>
        </div>

        <div style={{ fontSize: 13, color: "#666" }}>
          <span>{text.length}</span>
          <span style={{ marginLeft: 6, color: text.length > MAX_LENGTH ? "#d9534f" : "#666" }}>
            / {MAX_LENGTH}
          </span>
        </div>
      </div>

      <div aria-live="assertive" style={{ minHeight: 28, marginTop: 8 }}>
        {visibleError ? (
          <div id="payment-instructions-error" style={{ color: "#d9534f", fontSize: 13 }}>
            {visibleError}
          </div>
        ) : success ? (
          <div id="payment-instructions-success" style={{ color: "#2e7d32", fontSize: 13 }}>
            {success}
          </div>
        ) : null}
      </div>
    </div>
  );
}