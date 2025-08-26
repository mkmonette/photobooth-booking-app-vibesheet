export async function downloadImage(input: string, filename?: string): Promise<void> {
  let constructedDataUrl: string | undefined;
  let blob: Blob | null = null;
  try {
    const isHttp = /^https?:\/\//i.test(input);
    const isBlobUrl = /^blob:/i.test(input);
    const isDataUrl = /^data:/i.test(input);
    const isLikelyBase64 = !isHttp && !isBlobUrl && !isDataUrl;

    // Helper to derive mime from a data URL
    const mimeFromDataUrl = (d: string) => {
      const m = /^data:([^;]+);base64,/.exec(d);
      return m && m[1] ? m[1] : "application/octet-stream";
    };

    if (isHttp) {
      // Try to fetch remote resource. If CORS prevents it, fallback to opening the url.
      try {
        const res = await fetch(input, { mode: "cors" });
        if (!res.ok) {
          // fallback: open in new tab
          window.open(input, "_blank");
          return;
        }
        blob = await res.blob();
      } catch (err) {
        // network or CORS error -> open directly
        window.open(input, "_blank");
        return;
      }
    } else if (isBlobUrl) {
      // Attempt to fetch the blob: URL (works if same origin)
      try {
        const res = await fetch(input);
        if (res.ok) {
          blob = await res.blob();
        } else {
          // if fetch fails, just open the blob URL
          window.open(input, "_blank");
          return;
        }
      } catch (err) {
        // fallback to open
        window.open(input, "_blank");
        return;
      }
    } else {
      // data: URL or raw base64
      if (isDataUrl) {
        constructedDataUrl = input;
      } else if (isLikelyBase64) {
        // treat as raw base64 (assume PNG)
        constructedDataUrl = `data:image/png;base64,${input}`;
      }
      if (!constructedDataUrl) {
        throw new Error("No data URL available");
      }
      // Use fetch on the data URL to get a blob without using atob
      try {
        const res = await fetch(constructedDataUrl);
        if (!res.ok) throw new Error("Failed to fetch data URL");
        blob = await res.blob();
      } catch (err) {
        // As a last resort, try to convert via atob but guard large sizes
        try {
          const base64Data = constructedDataUrl.split(",")[1] || "";
          // If extremely large, avoid atob (it may throw)
          if (base64Data.length > 5_000_000) {
            // Too big for atob in many browsers; open data URL in new tab instead
            window.open(constructedDataUrl, "_blank");
            return;
          }
          const byteString = atob(base64Data);
          const arr = new Uint8Array(byteString.length);
          for (let i = 0; i < byteString.length; i++) {
            arr[i] = byteString.charCodeAt(i);
          }
          const mime = mimeFromDataUrl(constructedDataUrl);
          blob = new Blob([arr], { type: mime });
        } catch (e) {
          // final fallback: open data URL
          window.open(constructedDataUrl, "_blank");
          return;
        }
      }
    }

    if (!blob) {
      throw new Error("Unable to obtain blob for download");
    }

    // Determine mime & extension
    const mime = blob.type || (constructedDataUrl ? mimeFromDataUrl(constructedDataUrl) : "application/octet-stream");
    const ext = (() => {
      switch (mime) {
        case "image/jpeg":
        case "image/jpg":
          return "jpg";
        case "image/png":
          return "png";
        case "image/gif":
          return "gif";
        case "image/webp":
          return "webp";
        case "image/svg+xml":
          return "svg";
        default:
          return (mime.split("/")[1] || "bin").replace(/\+xml$/, "xml");
      }
    })();

    const finalName =
      filename ||
      `image-${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = finalName;
    // append so click works cross-browser
    document.body.appendChild(a);
    a.click();
    a.remove();
    // revoke after short delay to ensure download has started
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch (_e) {
        // ignore
      }
    }, 5000);
  } catch (err) {
    // fallback: try opening the best candidate we have
    try {
      if (constructedDataUrl) {
        window.open(constructedDataUrl, "_blank");
      } else {
        window.open(input, "_blank");
      }
    } catch (_e) {
      // silent
    }
  }
}

export default function GalleryViewer(props: { gallery: Gallery | RawImage[] | null }) {
  const { gallery } = props;

  const images: RawImage[] = useMemo(() => {
    if (!gallery) return [];
    if (Array.isArray(gallery)) return gallery;
    if (gallery.images && Array.isArray(gallery.images)) return gallery.images as RawImage[];
    return [];
  }, [gallery]);

  const normalized = useMemo(
    () =>
      images.map((img, idx) => {
        if (!img) {
          return {
            id: `img-${idx}`,
            filename: undefined,
            data: "",
            mime: undefined,
            alt: `Image ${idx + 1}`,
          } as RawImage;
        }
        // If item is a simple string (some code paths), normalize it
        if (typeof (img as any) === "string") {
          const s = img as unknown as string;
          return {
            id: `img-${idx}`,
            filename: undefined,
            data: s,
            mime: undefined,
            alt: `Image ${idx + 1}`,
          } as RawImage;
        }
        return {
          id: (img as any).id ?? `img-${idx}`,
          filename: (img as any).filename,
          data: (img as any).data,
          mime: (img as any).mime,
          alt: (img as any).alt ?? `Image ${idx + 1}`,
          thumbnail: (img as any).thumbnail,
        } as RawImage;
      }),
    [images]
  );

  const [index, setIndex] = useState(0);
  useEffect(() => {
    // reset index if images change
    setIndex((i) => Math.max(0, Math.min(i, normalized.length - 1)));
  }, [normalized.length]);

  const current = normalized[index];

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (normalized.length === 0) return;
      if (e.key === "ArrowRight") {
        setIndex((i) => Math.min(i + 1, normalized.length - 1));
      } else if (e.key === "ArrowLeft") {
        setIndex((i) => Math.max(i - 1, 0));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [normalized.length]);

  // Zoom & pan state
  const [zoom, setZoom] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const translateRef = useRef(translate);
  useEffect(() => {
    translateRef.current = translate;
  }, [translate]);

  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef({ x: 0, y: 0 });
  const lastRef = useRef({ x: 0, y: 0 });
  const imgWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Reset pan when image or zoom changes to 1
    if (zoom === 1) {
      setTranslate({ x: 0, y: 0 });
      lastRef.current = { x: 0, y: 0 };
    }
  }, [index, zoom]);

  // Mouse handlers for panning
  useEffect(() => {
    const el = imgWrapRef.current;
    if (!el) return;

    function onMove(e: MouseEvent) {
      if (!draggingRef.current) return;
      e.preventDefault();
      const clientX = e.clientX;
      const clientY = e.clientY;
      const dx = clientX - startRef.current.x;
      const dy = clientY - startRef.current.y;
      setTranslate({
        x: lastRef.current.x + dx,
        y: lastRef.current.y + dy,
      });
    }
    function onUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setDragging(false);
      lastRef.current = { ...translateRef.current };
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }

    function onDown(e: MouseEvent) {
      if (zoom <= 1) return;
      draggingRef.current = true;
      setDragging(true);
      startRef.current = { x: e.clientX, y: e.clientY };
      // start from the latest translate
      lastRef.current = { ...translateRef.current };
      document.body.style.cursor = "grabbing";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    }

    el.addEventListener("mousedown", onDown);
    return () => {
      el.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      draggingRef.current = false;
      setDragging(false);
    };
  }, [zoom]);

  // Touch handlers for pan (basic)
  useEffect(() => {
    const el = imgWrapRef.current;
    if (!el) return;

    let touchStart = { x: 0, y: 0 };
    let last = { x: 0, y: 0 };
    let active = false;

    function onTouchStart(e: TouchEvent) {
      if (zoom <= 1) return;
      const t = e.touches[0];
      touchStart = { x: t.clientX, y: t.clientY };
      last = { ...translateRef.current };
      active = true;
      draggingRef.current = true;
      setDragging(true);
    }
    function onTouchMove(e: TouchEvent) {
      if (!active) return;
      const t = e.touches[0];
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      setTranslate({ x: last.x + dx, y: last.y + dy });
    }
    function onTouchEnd() {
      active = false;
      draggingRef.current = false;
      setDragging(false);
      lastRef.current = { ...translateRef.current };
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      draggingRef.current = false;
      setDragging(false);
    };
  }, [zoom]);

  if (!current) {
    return (
      <div
        role="region"
        aria-label="Gallery viewer"
        className="gallery-viewer empty"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          color: "var(--muted, #666)",
        }}
      >
        No images
      </div>
    );
  }

  function handlePrev() {
    setIndex((i) => Math.max(0, i - 1));
  }
  function handleNext() {
    setIndex((i) => Math.min(normalized.length - 1, i + 1));
  }
  function toggleZoom() {
    setZoom((z) => (z === 1 ? 2 : 1));
  }
  function handleDownload() {
    downloadImage(current.data, typeof current !== "string" ? current.filename : undefined).catch(() => {
      // swallow
    });
  }

  const galleryTitle =
    gallery && typeof gallery === "object" && gallery !== null && "title" in (gallery as any)
      ? (gallery as any).title
      : "Gallery viewer";

  return (
    <div
      role="region"
      aria-label={galleryTitle}
      className="gallery-viewer"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        width: "100%",
        maxWidth: 1024,
        margin: "0 auto",
        boxSizing: "border-box",
      }}
    >
      <div
        className="viewer-top"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            onClick={handlePrev}
            aria-label="Previous image"
            disabled={index === 0}
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid var(--border, #ccc)",
              background: "var(--surface, #fff)",
              cursor: index === 0 ? "not-allowed" : "pointer",
            }}
          >
            ?
          </button>
          <button
            type="button"
            onClick={handleNext}
            aria-label="Next image"
            disabled={index === normalized.length - 1}
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid var(--border, #ccc)",
              background: "var(--surface, #fff)",
              cursor: index === normalized.length - 1 ? "not-allowed" : "pointer",
            }}
          >
            ?
          </button>
          <div style={{ fontSize: 14, color: "var(--muted, #444)" }}>
            {index + 1} / {normalized.length}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            onClick={toggleZoom}
            aria-label={zoom === 1 ? "Zoom in" : "Zoom out"}
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid var(--border, #ccc)",
              background: "var(--surface, #fff)",
            }}
          >
            {zoom === 1 ? "Zoom" : "Reset"}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            aria-label="Download image"
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid var(--border, #ccc)",
              background: "var(--surface, #fff)",
            }}
          >
            ? Download
          </button>
        </div>
      </div>

      <div
        ref={imgWrapRef}
        className="viewer-main"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          borderRadius: 8,
          border: "1px solid var(--border, #eee)",
          background: "var(--bg, #fafafa)",
          minHeight: 240,
          maxHeight: 720,
          position: "relative",
          touchAction: zoom > 1 ? "pan-y" : "none",
        }}
      >
        <img
          src={current.data}
          alt={current.alt || `Image ${index + 1}`}
          loading="lazy"
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            userSelect: "none",
            transform: `scale(${zoom}) translate(${translate.x / zoom}px, ${translate.y / zoom}px)`,
            transition: dragging ? "none" : "transform 180ms ease",
            cursor: zoom > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in",
            display: "block",
            width: "auto",
            height: "auto",
            pointerEvents: "auto",
          }}
          onDoubleClick={toggleZoom}
          draggable={false}
        />
      </div>

      <div
        className="thumbnails"
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          padding: "6px 2px",
          alignItems: "center",
        }}
        aria-label="Gallery thumbnails"
      >
        {normalized.map((img, i) => {
          const isString = typeof (img as any) === "string";
          const thumbSrc = isString ? (img as unknown as string) : (img as RawImage).thumbnail ?? (img as RawImage).data;
          const isActive = i === index;
          const key = (isString ? `img-${i}` : (img as RawImage).id) || `img-${i}`;
          return (
            <button
              key={key}
              onClick={() => setIndex(i)}
              aria-label={`Show image ${i + 1}`}
              style={{
                border: isActive ? "2px solid var(--accent, #0a84ff)" : "1px solid var(--border, #ddd)",
                padding: 2,
                borderRadius: 6,
                background: "transparent",
                minWidth: 56,
                minHeight: 56,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <img
                src={thumbSrc}
                alt={isString ? `Image ${i + 1}` : (img as RawImage).alt ?? `Image ${i + 1}`}
                loading="lazy"
                style={{
                  width: 52,
                  height: 52,
                  objectFit: "cover",
                  display: "block",
                  borderRadius: 4,
                }}
                draggable={false}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}