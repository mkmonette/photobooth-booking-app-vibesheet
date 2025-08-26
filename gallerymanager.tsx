const GALLERIES_KEY = "photobooth_galleries_v2";
const BOOKINGS_KEY = "photobooth_bookings_v2";

function uid(prefix = "") {
  return (
    prefix +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 9)
  );
}

function safeParse<T>(json: string | null, fallback: T): T {
  try {
    if (!json) return fallback;
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

async function readFilesAsDataURLs(files: FileList | null): Promise<string[]> {
  if (!files || files.length === 0) return [];
  const arr = Array.from(files);
  const readers = arr.map(
    (f) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          resolve(String(reader.result));
        };
        reader.onerror = () => reject(new Error("Failed reading file"));
        reader.readAsDataURL(f);
      })
  );
  return Promise.all(readers);
}

export default function GalleryManager(): JSX.Element {
  const [title, setTitle] = useState("");
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(
    null
  );
  const [sending, setSending] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(GALLERIES_KEY);
    const parsed = safeParse<Gallery[]>(raw, []);
    setGalleries(parsed);

    const rawB = localStorage.getItem(BOOKINGS_KEY);
    let parsedB = safeParse<Booking[]>(rawB, []);
    // If no bookings exist, seed a couple for the UI to choose from
    if (!parsedB || parsedB.length === 0) {
      parsedB = [
        { id: uid("b_"), name: "Alice Johnson", email: "alice@example.com" },
        { id: uid("b_"), name: "Bob Martinez", email: "bob@example.com" },
      ];
      localStorage.setItem(BOOKINGS_KEY, JSON.stringify(parsedB));
    }
    setBookings(parsedB);
    if (parsedB.length > 0) setSelectedBookingId(parsedB[0].id);
  }, []);

  useEffect(() => {
    // generate previews when selectedFiles changes
    let cancelled = false;
    (async () => {
      if (!selectedFiles) {
        setPreviewImages([]);
        return;
      }
      const dataUrls = await readFilesAsDataURLs(selectedFiles);
      if (!cancelled) setPreviewImages(dataUrls);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedFiles]);

  // Persist galleries whenever they change
  useEffect(() => {
    localStorage.setItem(GALLERIES_KEY, JSON.stringify(galleries));
  }, [galleries]);

  // Persist bookings whenever they change
  useEffect(() => {
    localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings));
  }, [bookings]);

  async function uploadGallery(payload: {
    title: string;
    images: string[];
    expiresAt?: string;
  }): Promise<string> {
    try {
      const id = uid("g_");
      const createdAt = new Date().toISOString();
      const expired =
        payload.expiresAt !== undefined &&
        payload.expiresAt !== "" &&
        new Date(payload.expiresAt) <= new Date();
      const gallery: Gallery = {
        id,
        title: payload.title,
        images: payload.images,
        createdAt,
        expiresAt:
          payload.expiresAt && payload.expiresAt !== ""
            ? payload.expiresAt
            : undefined,
        expired,
        shares: [],
      };
      setGalleries((prev) => [gallery, ...prev]);
      return id;
    } catch (err) {
      throw err;
    }
  }

  async function expireGallery(id: string): Promise<void> {
    try {
      setGalleries((prev) =>
        prev.map((g) =>
          g.id === id
            ? {
                ...g,
                expired: true,
                expiresAt: new Date().toISOString(),
              }
            : g
        )
      );
    } catch (err) {
      throw err;
    }
  }

  async function sendGalleryLink(
    bookingId: string,
    galleryId: string
  ): Promise<string> {
    try {
      const link = `${window.location.origin}/gallery/${galleryId}`;
      // attach galleryId to booking
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, galleryId } : b))
      );
      // add share record on gallery
      setGalleries((prev) =>
        prev.map((g) =>
          g.id === galleryId
            ? {
                ...g,
                shares: [
                  ...(g.shares ?? []),
                  { bookingId, sentAt: new Date().toISOString() },
                ],
              }
            : g
        )
      );
      return link;
    } catch (err) {
      throw err;
    }
  }

  // Handlers for the UI
  async function handleUpload(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setMessage(null);
    if (!title.trim()) {
      setMessage("Please enter a title for the gallery.");
      return;
    }
    if (!selectedFiles || selectedFiles.length === 0) {
      setMessage("Please select at least one image.");
      return;
    }
    setLoading(true);
    try {
      const images = await readFilesAsDataURLs(selectedFiles);
      // Basic validation/limits
      if (images.length > 20) {
        setMessage("Maximum 20 images are allowed per gallery.");
        setLoading(false);
        return;
      }
      const id = await uploadGallery({
        title: title.trim(),
        images,
        expiresAt,
      });
      setMessage(`Gallery created (${id}).`);
      // reset form
      setTitle("");
      setExpiresAt("");
      setSelectedFiles(null);
      setPreviewImages([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      console.error(err);
      setMessage("Failed to upload gallery.");
    } finally {
      setLoading(false);
    }
  }

  async function handleExpire(id: string) {
    setMessage(null);
    try {
      await expireGallery(id);
      setMessage("Gallery expired.");
    } catch (err) {
      console.error(err);
      setMessage("Failed to expire gallery.");
    }
  }

  async function handleSend(bookingId: string | null, galleryId: string) {
    setMessage(null);
    if (!bookingId) {
      setMessage("Select a booking to send the gallery link to.");
      return;
    }
    setSending(true);
    try {
      const link = await sendGalleryLink(bookingId, galleryId);
      // copy to clipboard if available
      try {
        await navigator.clipboard.writeText(link);
        setMessage(`Link sent and copied to clipboard: ${link}`);
      } catch {
        setMessage(`Link sent: ${link}`);
      }
    } catch (err) {
      console.error(err);
      setMessage("Failed to send gallery link.");
    } finally {
      setSending(false);
    }
  }

  // UI Layout (mobile-first)
  return (
    <div
      style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: 16,
        fontFamily:
          "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif",
        color: "var(--text,#0f172a)",
      }}
      aria-live="polite"
    >
      <h2 style={{ margin: "8px 0 16px", fontSize: 20 }}>Gallery Manager</h2>

      <form
        onSubmit={handleUpload}
        style={{
          background: "var(--card,#fff)",
          padding: 12,
          borderRadius: 8,
          boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
          marginBottom: 16,
        }}
      >
        <label style={{ display: "block", marginBottom: 8 }}>
          <div style={{ fontSize: 14, marginBottom: 6 }}>Gallery title</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Smith wedding - July 2025"
            required
            aria-required
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
            }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 8 }}>
          <div style={{ fontSize: 14, marginBottom: 6 }}>Images</div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) =>
              setSelectedFiles(
                e.target.files && e.target.files.length ? e.target.files : null
              )
            }
            aria-label="Select gallery images"
            style={{ width: "100%" }}
          />
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {previewImages.slice(0, 12).map((src, i) => (
              <img
                key={i}
                src={src}
                alt={`preview ${i + 1}`}
                style={{
                  width: 72,
                  height: 72,
                  objectFit: "cover",
                  borderRadius: 6,
                  border: "1px solid #e5e7eb",
                }}
              />
            ))}
            {previewImages.length > 12 && (
              <div
                style={{
                  width: 72,
                  height: 72,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 6,
                  border: "1px solid #e5e7eb",
                  background: "#f8fafc",
                  color: "#475569",
                  fontSize: 12,
                }}
              >
                +{previewImages.length - 12}
              </div>
            )}
          </div>
        </label>

        <label style={{ display: "block", marginBottom: 12 }}>
          <div style={{ fontSize: 14, marginBottom: 6 }}>Expires at (optional)</div>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
            }}
          />
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
            Leave empty for no automatic expiry.
          </div>
        </label>

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "10px 14px",
              background: "#0ea5a4",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            {loading ? "Uploading?" : "Create gallery"}
          </button>
          <button
            type="button"
            onClick={() => {
              setTitle("");
              setSelectedFiles(null);
              setPreviewImages([]);
              setExpiresAt("");
              setMessage(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            style={{
              padding: "10px 14px",
              background: "#f3f4f6",
              color: "#111827",
              border: "none",
              borderRadius: 8,
            }}
          >
            Reset
          </button>
        </div>

        {message && (
          <div
            role="status"
            style={{
              marginTop: 12,
              padding: 10,
              borderRadius: 6,
              background: "#eef2ff",
              color: "#3730a3",
            }}
          >
            {message}
          </div>
        )}
      </form>

      <section aria-labelledby="existing-galleries">
        <h3 id="existing-galleries" style={{ fontSize: 16, margin: "6px 0 10px" }}>
          Existing galleries ({galleries.length})
        </h3>

        {galleries.length === 0 && (
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              background: "#fff",
              border: "1px dashed #e5e7eb",
            }}
          >
            No galleries yet. Create one above.
          </div>
        )}

        <div style={{ display: "grid", gap: 12 }}>
          {galleries.map((g) => {
            const isExpired =
              g.expired ||
              (g.expiresAt ? new Date(g.expiresAt) <= new Date() : false);
            return (
              <div
                key={g.id}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                  padding: 12,
                  borderRadius: 8,
                  background: "#fff",
                  border: "1px solid #e6e7eb",
                }}
                aria-labelledby={`gallery-${g.id}-title`}
              >
                <div style={{ width: 96, flexShrink: 0 }}>
                  <img
                    src={g.images[0]}
                    alt={g.title}
                    style={{
                      width: 96,
                      height: 72,
                      objectFit: "cover",
                      borderRadius: 6,
                      border: "1px solid #e5e7eb",
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    id={`gallery-${g.id}-title`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{g.title}</div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>
                        {g.images.length} image{g.images.length !== 1 ? "s" : ""} ?
                        created {new Date(g.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div
                        style={{
                          fontSize: 12,
                          color: isExpired ? "#ef4444" : "#059669",
                          fontWeight: 600,
                        }}
                      >
                        {isExpired ? "Expired" : "Active"}
                      </div>
                      <div style={{ fontSize: 11, color: "#6b7280" }}>
                        {g.expiresAt ? `Expires ${new Date(g.expiresAt).toLocaleString()}` : ""}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      marginTop: 10,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      onClick={() => {
                        // open gallery in new tab / route
                        window.open(`/gallery/${g.id}`, "_blank");
                      }}
                      style={{
                        padding: "6px 10px",
                        background: "#eef2ff",
                        borderRadius: 8,
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      View
                    </button>

                    {!isExpired && (
                      <button
                        onClick={() => handleExpire(g.id)}
                        style={{
                          padding: "6px 10px",
                          background: "#fff5f5",
                          borderRadius: 8,
                          border: "1px solid #fee2e2",
                          color: "#b91c1c",
                          cursor: "pointer",
                        }}
                      >
                        Expire now
                      </button>
                    )}

                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <label style={{ fontSize: 13 }}>Send to booking</label>
                      <select
                        value={selectedBookingId ?? ""}
                        onChange={(e) => setSelectedBookingId(e.target.value)}
                        aria-label="Select booking"
                        style={{
                          padding: "6px 8px",
                          borderRadius: 6,
                          border: "1px solid #e5e7eb",
                        }}
                      >
                        {bookings.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name} {b.email ? `(${b.email})` : ""}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleSend(selectedBookingId, g.id)}
                        disabled={sending}
                        style={{
                          padding: "6px 10px",
                          background: "#0ea5a4",
                          color: "#fff",
                          borderRadius: 8,
                          border: "none",
                        }}
                      >
                        {sending ? "Sending?" : "Send"}
                      </button>
                    </div>
                  </div>

                  {g.shares && g.shares.length > 0 && (
                    <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
                      Sent to {g.shares.length} booking{g.shares.length !== 1 ? "s" : ""} ?{" "}
                      Last: {new Date(g.shares[g.shares.length - 1].sentAt).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}