export function renderTemplatePreview(template: string, context: ContextObject): string {
  if (!template) return "";

  const getValueFromPath = (path: string, ctx: ContextObject): string | undefined => {
    const parts = path.split(".");
    let current: any = ctx;
    for (const p of parts) {
      if (current == null) return undefined;
      // allow array index like items[0]
      const arrayMatch = p.match(/^([a-zA-Z0-9_$-]+)\[(\d+)\]$/);
      if (arrayMatch) {
        const key = arrayMatch[1];
        const idx = parseInt(arrayMatch[2], 10);
        current = current[key];
        if (!Array.isArray(current)) return undefined;
        current = current[idx];
      } else {
        current = current[p];
      }
    }
    if (current == null) return undefined;
    if (typeof current === "object") {
      try {
        return JSON.stringify(current);
      } catch {
        return String(current);
      }
    }
    return String(current);
  };

  // Match tokens like {{ ... }} where ... does not contain braces
  const tokenRegex = /\{\{\s*([^{}]+?)\s*\}\}/g;

  const replaced = template.replace(tokenRegex, (_, raw) => {
    const parts = raw.split("|").map((s) => s.trim());
    const key = parts[0] ?? "";
    const def = parts.length > 1 ? parts.slice(1).join("|") : undefined;

    if (!key) return def ?? "";

    const value = getValueFromPath(key, context);
    if (value !== undefined) return value;
    if (def !== undefined) return def;
    // Fallback: show human-friendly placeholder
    return `{{${key}}}`;
  });

  return replaced;
}

/**
 * Validate template string and return an error message or null if valid.
 * Checks:
 * - Not empty / minimal length
 * - No triple/malformed moustache braces
 * - No stray braces outside well-formed tokens
 * - No <script> tags
 * - Token names only contain allowed characters (letters, numbers, _, -, ., [, ])
 */
export function validateTemplate(template: string): string | null {
  if (template == null) return "Template is required.";
  const trimmed = template.trim();
  if (trimmed.length < 3) return "Template is too short.";

  // Disallow script tags
  if (/<\s*script/i.test(template)) return "Template must not contain script tags.";

  // Disallow triple braces which indicate malformed tokens like {{{ or }}}
  if (/(\{\{\{)|(\}\}\})/.test(template)) return "Malformed braces found in template.";

  // Token regex: capture anything except braces inside token
  const tokenRegex = /\{\{\s*([^{}]+?)\s*\}\}/g;
  let match: RegExpExecArray | null;
  const matches: Array<{ raw: string; index: number; length: number }> = [];
  while ((match = tokenRegex.exec(template)) !== null) {
    matches.push({ raw: match[1].trim(), index: match.index, length: match[0].length });
  }

  // After removing valid tokens, there should be no stray '{' or '}' characters
  let cleaned = template;
  // Replace matches from end to start to keep indices valid
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    cleaned = cleaned.slice(0, m.index) + cleaned.slice(m.index + m.length);
  }
  if (/[{}]/.test(cleaned)) return "Unmatched or stray '{' or '}' found in template.";

  // Now validate each token's key part
  for (const m of matches) {
    const raw = m.raw;
    if (!raw) return "Empty token found in template.";
    // Allow default using '|' ? validate only the key part before first '|'
    const keyPart = raw.split("|")[0].trim();
    if (!keyPart) return "Invalid token syntax.";
    // Keys can be dot separated, with array indices like items[0]
    const segments = keyPart.split(".");
    for (const seg of segments) {
      if (seg === "") return "Invalid token syntax.";
      // Split into name and array indexes: e.g., items[0][1]
      const nameMatch = seg.match(/^([a-zA-Z0-9_$-]+)((\[\d+\])*)$/);
      if (!nameMatch) return `Invalid token segment: ${seg}`;
      const indexes = nameMatch[2];
      if (indexes) {
        // validate each [n]
        const idxMatches = indexes.match(/\[\d+\]/g) || [];
        for (const im of idxMatches) {
          if (!/^\[\d+\]$/.test(im)) return `Invalid array index in token: ${seg}`;
        }
      }
    }
  }

  return null;
}

/**
 * Save template to either provided onSave or to localStorage fallback.
 */
export async function saveTemplate(template: string, onSave?: (tpl: string) => Promise<void>): Promise<void> {
  if (onSave) {
    await onSave(template);
    return;
  }
  // Default fallback to localStorage (safe-guarded)
  return new Promise((resolve) => {
    try {
      if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
        localStorage.setItem("reminderTemplate", template);
      }
    } catch {
      // ignore storage errors
    }
    resolve();
  });
}

interface Props {
  initialTemplate?: string;
  onSave?: (tpl: string) => Promise<void>;
}

export default function ReminderTemplateEditor({ initialTemplate, onSave }: Props): JSX.Element {
  const defaultBuiltIn = useMemo(
    () =>
      "Hi {{customer.firstName|Guest}},\n\nThis is a reminder for your booking on {{bookingDate}} at {{bookingTime}} at {{venue}}.\nBooking code: {{code}}\n\nThanks!",
    []
  );

  // Helper to try reading stored template (guarding SSR)
  const readStored = useCallback((): string | null => {
    try {
      if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
        return localStorage.getItem("reminderTemplate");
      }
    } catch {
      // ignore
    }
    return null;
  }, []);

  const getInitial = useCallback((): string => {
    if (initialTemplate) return initialTemplate;
    const stored = readStored();
    if (stored) return stored;
    return defaultBuiltIn;
  }, [initialTemplate, readStored, defaultBuiltIn]);

  const [template, setTemplate] = useState<string>(() => getInitial());
  const [preview, setPreview] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Example context used for preview
  const sampleContext = useMemo(() => {
    return {
      customer: { firstName: "Alex", lastName: "Lee" },
      bookingDate: "2025-09-12",
      bookingTime: "18:30",
      venue: "Studio A",
      duration: "2h",
      code: "ABC123",
      items: [{ name: "Photo Booth" }, { name: "Props" }],
    };
  }, []);

  // Validate whenever template changes
  useEffect(() => {
    const validation = validateTemplate(template);
    setError(validation);
  }, [template]);

  // Debounced preview update for performance
  useEffect(() => {
    const handler = setTimeout(() => {
      setPreview(renderTemplatePreview(template, sampleContext));
    }, 250);
    return () => clearTimeout(handler);
  }, [template, sampleContext]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTouched(true);
    setTemplate(e.target.value);
    setSuccessMessage(null);
  }, []);

  const handleReset = useCallback(() => {
    const stored = readStored();
    setTemplate(initialTemplate ?? stored ?? defaultBuiltIn);
    setTouched(false);
    setSuccessMessage(null);
  }, [initialTemplate, readStored, defaultBuiltIn]);

  const handleSave = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      setTouched(true);
      const validation = validateTemplate(template);
      setError(validation);
      if (validation) return;

      setSaving(true);
      setSuccessMessage(null);
      try {
        await saveTemplate(template, onSave);
        setSuccessMessage("Template saved.");
        // persist to localStorage as backup if onSave provided or even if onSave not provided
        try {
          if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
            localStorage.setItem("reminderTemplate", template);
          }
        } catch {
          // ignore
        }
      } catch (err) {
        setError((err && (err as Error).message) || "Failed to save template.");
      } finally {
        setSaving(false);
      }
    },
    [template, onSave]
  );

  const insertAtCursor = useCallback((insert: string) => {
    const el = textareaRef.current;
    if (!el) {
      setTemplate((t) => (t ? t + "\n" + insert : insert));
      return;
    }
    const s = el.selectionStart ?? el.value.length;
    const e = el.selectionEnd ?? s;
    const newVal = el.value.slice(0, s) + insert + el.value.slice(e);
    setTemplate(newVal);
    // restore focus and move cursor after inserted text
    requestAnimationFrame(() => {
      el.focus();
      const pos = s + insert.length;
      try {
        el.setSelectionRange(pos, pos);
      } catch {
        // ignore if not supported
      }
    });
  }, []);

  return (
    <form
      onSubmit={handleSave}
      aria-labelledby="reminder-template-editor-heading"
      style={{
        maxWidth: 800,
        margin: "0 auto",
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h2 id="reminder-template-editor-heading" style={{ margin: 0, fontSize: 18 }}>
          Reminder Template
        </h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={handleReset}
            aria-label="Reset template to default"
            style={{
              padding: "8px 12px",
              background: "transparent",
              border: "1px solid var(--border, #ddd)",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Reset
          </button>
          <button
            type="submit"
            disabled={!!error || saving}
            style={{
              padding: "8px 12px",
              background: !!error || saving ? "var(--muted, #ccc)" : "var(--primary, #0b76ef)",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: !!error || saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving?" : "Save"}
          </button>
        </div>
      </div>

      <label htmlFor="template-editor" style={{ fontSize: 13, color: "var(--mutedText, #555)" }}>
        Use tokens like {"{{customer.firstName}}"}, {"{{bookingDate}}"}, {"{{bookingTime}}"}.
      </label>

      <textarea
        id="template-editor"
        ref={textareaRef}
        value={template}
        onChange={handleChange}
        rows={10}
        aria-invalid={!!error}
        aria-describedby={error ? "template-error" : undefined}
        style={{
          width: "100%",
          minHeight: 160,
          padding: 12,
          borderRadius: 8,
          border: "1px solid var(--border, #ddd)",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', monospace",
          fontSize: 14,
          resize: "vertical",
        }}
      />

      {error && (
        <div id="template-error" role="alert" style={{ color: "var(--danger, #b00020)", fontSize: 13 }}>
          {error}
        </div>
      )}

      <div
        aria-live="polite"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong style={{ fontSize: 14 }}>Preview</strong>
          <span style={{ fontSize: 12, color: "var(--mutedText, #666)" }}>
            (sample data shown ? actual values will be substituted when sending)
          </span>
        </div>

        <div
          role="region"
          aria-label="Template preview"
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            padding: 12,
            borderRadius: 8,
            background: "var(--panelBg, #fafafa)",
            border: "1px solid var(--border, #eee)",
            minHeight: 100,
            fontSize: 14,
          }}
        >
          {preview}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={() => insertAtCursor("{{customer.firstName}}")}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--border, #ddd)",
              background: "white",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {'Insert ' + '{{customer.firstName}}'}
          </button>
          <button
            type="button"
            onClick={() => insertAtCursor("{{bookingDate}}")}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--border, #ddd)",
              background: "white",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {'Insert ' + '{{bookingDate}}'}
          </button>
        </div>
      </div>

      <div aria-live="polite" style={{ minHeight: 20 }}>
        {successMessage && (
          <div role="status" style={{ color: "var(--success, #0a7a3a)", fontSize: 13 }}>
            {successMessage}
          </div>
        )}
      </div>
    </form>
  );
}