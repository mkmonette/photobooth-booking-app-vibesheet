export function computeBytesFromBase64(base64: string): number {
  // Remove data URL prefix if present
  const parts = base64.split(",");
  const b64 = parts.length > 1 ? parts[1] : parts[0];

  // Remove whitespace/newlines that may be present
  const cleaned = b64.replace(/\s+/g, "");

  // Base64 padding: number of '=' at the end
  let padding = 0;
  if (cleaned.endsWith("==")) padding = 2;
  else if (cleaned.endsWith("=")) padding = 1;

  // Each 4 base64 chars represent 3 bytes
  return Math.floor((cleaned.length * 3) / 4) - padding;
}

/**
 * Validate a base64 data URL or raw base64 string for allowed type and size.
 * Returns a string error message on failure, or null on success.
 */
export function validatePaymentProof(base64: string): string | null {
  if (!base64 || typeof base64 !== "string") return "Invalid file data.";

  // Try to detect MIME type if present
  const headerMatch = base64.match(/^data:([^;]+);base64,/);
  const mime = headerMatch ? headerMatch[1].toLowerCase() : "";

  const allowedTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf",
  ];

  if (!mime || !allowedTypes.includes(mime)) {
    return "Unsupported file type. Please upload JPG, PNG, WEBP, GIF or PDF.";
  }

  const bytes = computeBytesFromBase64(base64);
  const maxBytes = 5 * 1024 * 1024; // 5 MB
  if (bytes > maxBytes) {
    return `File is too large (${(bytes / 1024 / 1024).toFixed(
      2
    )} MB). Max allowed is 5 MB.`;
  }

  return null;
}

/**
 * Simulate an upload by persisting the data URL to localStorage.
 * Throws an Error if validation fails or persistence fails.
 * Returns a stable reference string that can be used to lookup the stored item.
 */
export async function uploadPaymentProof(file: File): Promise<string> {
  const maxRawBytes = 5 * 1024 * 1024; // 5 MB

  // Quick client-side raw size check before reading
  if (file.size > maxRawBytes) {
    throw new Error("Selected file is too large. Max allowed is 5 MB.");
  }

  // Read file as data URL
  const readAsDataURL = (f: File) =>
    new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const result = fr.result;
        if (typeof result === "string") resolve(result);
        else reject(new Error("Unable to read file as data URL."));
      };
      fr.onerror = () => reject(new Error("Failed to read file."));
      fr.readAsDataURL(f);
    });

  const base64 = await readAsDataURL(file);

  // Validate decoded bytes and mime
  const validationError = validatePaymentProof(base64);
  if (validationError) {
    throw new Error(validationError);
  }

  // Persist to localStorage (app-level storage). Surface explicit errors on failure.
  const key = "payment_proofs_v1";
  let store: Record<
    string,
    { filename: string; dataUrl: string; createdAt: number }
  > = {};

  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          store = parsed;
        } else {
          // If the stored value isn't an object, overwrite it below
          store = {};
        }
      } catch {
        // Corrupt JSON, overwrite with a fresh store (but surface the situation)
        store = {};
      }
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    store[id] = {
      filename: file.name,
      dataUrl: base64,
      createdAt: Date.now(),
    };

    try {
      localStorage.setItem(key, JSON.stringify(store));
    } catch (err) {
      // LocalStorage write failed (quota or other). Surface a clear error to the caller.
      throw new Error(
        "Failed to persist payment proof to local storage (quota may be exceeded). Try compressing the image or free up storage and try again."
      );
    }

    return `localstorage://payment-proof/${id}`;
  } catch (err: any) {
    // Re-throw to allow UI to present a clear message
    throw err instanceof Error ? err : new Error("Failed to save payment proof.");
  }
}

export default function PaymentStep(props: Props): JSX.Element {
  const { bookingDraft, onSubmit } = props;
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingPreview, setUploadingPreview] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const f = e.target.files && e.target.files[0];
    if (!f) {
      setSelectedFile(null);
      setPreviewDataUrl(null);
      return;
    }

    // Enforce raw file size <= 5MB before reading
    const maxRawBytes = 5 * 1024 * 1024;
    if (f.size > maxRawBytes) {
      setSelectedFile(null);
      setPreviewDataUrl(null);
      setError("Selected file is too large. Max allowed is 5 MB.");
      // Clear input value so users can re-select same file if needed
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setUploadingPreview(true);
    const fr = new FileReader();
    fr.onload = () => {
      const dataUrl = fr.result as string;
      const v = validatePaymentProof(dataUrl);
      if (v) {
        setSelectedFile(null);
        setPreviewDataUrl(null);
        setError(v);
        if (inputRef.current) inputRef.current.value = "";
      } else {
        setSelectedFile(f);
        setPreviewDataUrl(dataUrl);
      }
      setUploadingPreview(false);
    };
    fr.onerror = () => {
      setSelectedFile(null);
      setPreviewDataUrl(null);
      setError("Failed to read the selected file.");
      setUploadingPreview(false);
      if (inputRef.current) inputRef.current.value = "";
    };
    fr.readAsDataURL(f);
  };

  const handleRemove = useCallback(() => {
    setSelectedFile(null);
    setPreviewDataUrl(null);
    setError(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);

    if (!selectedFile) {
      setError("Please attach a payment proof before submitting.");
      return;
    }

    setSubmitting(true);
    try {
      const proofReference = await uploadPaymentProof(selectedFile);
      await onSubmit({
        bookingDraft: bookingDraft ?? {},
        paymentProofRef: proofReference,
        paymentProofFilename: selectedFile.name,
        submittedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      setError(err?.message || "Failed to upload payment proof.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenPreview = useCallback(() => {
    // Prefer opening an object URL derived from the File (safer than document.write).
    if (selectedFile) {
      const url = URL.createObjectURL(selectedFile);
      const w = window.open(url);
      if (w) {
        try {
          w.focus();
        } catch {}
        // Revoke after a delay to allow the new tab to load
        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 10000);
        return;
      }
    }

    // Fallback: open data URL in a new window/tab if available
    if (previewDataUrl) {
      const w = window.open();
      if (w) {
        try {
          // Assign location.href (avoids document.write)
          w.location.href = previewDataUrl;
          w.focus();
        } catch {
          // If the browser blocks navigation, try writing a basic HTML that references the data URL
          try {
            w.document.write(
              `<title>Payment proof preview</title><iframe src="${previewDataUrl}" style="position:absolute;top:0;left:0;right:0;bottom:0;border:0;width:100%;height:100%;"></iframe>`
            );
            w.document.close();
          } catch {}
        }
      }
    }
  }, [selectedFile, previewDataUrl]);

  const renderPreview = () => {
    if (!previewDataUrl) return null;
    const headerMatch = previewDataUrl.match(/^data:([^;]+);base64,/);
    const mime = headerMatch ? headerMatch[1].toLowerCase() : "";

    if (mime === "application/pdf") {
      return (
        <embed
          src={previewDataUrl}
          type="application/pdf"
          style={{ width: "100%", height: 240, borderRadius: 6 }}
          aria-label="PDF preview of payment proof"
        />
      );
    }

    // For images, show an <img>
    return (
      <img
        src={previewDataUrl}
        alt="Payment proof preview"
        style={{
          maxWidth: "100%",
          maxHeight: 320,
          objectFit: "contain",
          borderRadius: 6,
        }}
      />
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      aria-labelledby="payment-step-title"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        width: "100%",
      }}
    >
      <div>
        <h2 id="payment-step-title" style={{ margin: "0 0 6px 0", fontSize: 18 }}>
          Upload payment proof
        </h2>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>
          Attach a photo or PDF receipt showing your payment. Max 5 MB.
        </p>
      </div>

      <div
        style={{
          display: "flex",
          gap: 12,
          flexDirection: "column",
        }}
      >
        <label
          htmlFor="payment-proof"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: 10,
            borderRadius: 8,
            border: "1px dashed #d1d5db",
            cursor: "pointer",
            background: "#fff",
          }}
        >
          <input
            id="payment-proof"
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            onChange={handleFileChange}
            aria-describedby={error ? "payment-error" : undefined}
            style={{ display: "none" }}
          />
          <span style={{ fontSize: 14, color: "#374151" }}>
            {selectedFile ? selectedFile.name : "Choose a file"}
          </span>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{
              marginLeft: "auto",
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              background: "#f9fafb",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Browse
          </button>
        </label>

        {uploadingPreview && (
          <div style={{ color: "#6b7280", fontSize: 13 }}>Preparing preview?</div>
        )}

        {previewDataUrl && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div
              style={{
                border: "1px solid #e5e7eb",
                padding: 8,
                borderRadius: 8,
                background: "#fff",
              }}
            >
              {renderPreview()}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={handleOpenPreview}
                style={{
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                Open preview
              </button>
              <button
                type="button"
                onClick={handleRemove}
                style={{
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid #fee2e2",
                  background: "#fff5f5",
                  color: "#b91c1c",
                  cursor: "pointer",
                }}
              >
                Remove
              </button>
            </div>
          </div>
        )}

        {error && (
          <div id="payment-error" role="alert" style={{ color: "#b91c1c", fontSize: 13 }}>
            {error}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "none",
            background: submitting ? "#9ca3af" : "#111827",
            color: "#fff",
            cursor: submitting ? "not-allowed" : "pointer",
            fontWeight: 600,
          }}
        >
          {submitting ? "Submitting?" : "Submit payment proof"}
        </button>

        <button
          type="button"
          onClick={() => {
            handleRemove();
          }}
          disabled={submitting}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: "#fff",
            color: "#111827",
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          Clear
        </button>
      </div>

      <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
        Booking summary: {bookingDraft?.summary ?? "?"}
      </div>
    </form>
  );
}