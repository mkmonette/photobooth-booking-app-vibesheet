const STORAGE_KEY = "photobooth:packages:v1";

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function PackageManager(): JSX.Element {
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState<number | "">("");
  const [duration, setDuration] = useState("");
  const [description, setDescription] = useState("");
  const [featuresText, setFeaturesText] = useState("");
  const [active, setActive] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Refs for lifecycle and timers
  const isFirstPersistRunRef = useRef(true);
  const pendingTimersRef = useRef<number[]>([]);
  const statusTimerRef = useRef<number | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PackageItem[];
        if (Array.isArray(parsed)) {
          setPackages(parsed);
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Failed to load packages from storage", e);
    }
    return () => {
      // cleanup on unmount: clear all timers
      pendingTimersRef.current.forEach((id) => window.clearTimeout(id));
      pendingTimersRef.current = [];
      if (statusTimerRef.current) {
        window.clearTimeout(statusTimerRef.current);
        statusTimerRef.current = null;
      }
    };
    // run once on mount/unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist whenever packages change, but skip the first run (initial load)
  useEffect(() => {
    if (isFirstPersistRunRef.current) {
      isFirstPersistRunRef.current = false;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(packages));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Failed to save packages to storage", e);
      setError("Unable to save packages. Storage may be full or unavailable.");
    }
  }, [packages]);

  // Helper to set a transient status message (clears previous timer)
  const showStatus = useCallback((msg: string, ms = 2000) => {
    setStatusMessage(msg);
    if (statusTimerRef.current) {
      window.clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    }
    const t = window.setTimeout(() => {
      setStatusMessage(null);
      statusTimerRef.current = null;
    }, ms);
    statusTimerRef.current = t;
  }, []);

  // Utility: clear form
  function resetForm() {
    setTitle("");
    setPrice("");
    setDuration("");
    setDescription("");
    setFeaturesText("");
    setActive(true);
    setEditingId(null);
    setError(null);
  }

  // Validation
  function validateForm(): string | null {
    if (!title.trim()) return "Package name is required.";
    if (price === "" || Number.isNaN(Number(price))) return "Price must be a number.";
    if (Number(price) < 0) return "Price cannot be negative.";
    return null;
  }

  // Create package (simulated async)
  async function createPackage(pkg: Partial<PackageItem>): Promise<void> {
    return new Promise((resolve, reject) => {
      const timerId = window.setTimeout(() => {
        try {
          const id = pkg.id ?? generateId();
          const now = Date.now();
          const newPkg: PackageItem = {
            id,
            title: pkg.title?.trim() ?? "Untitled Package",
            price: typeof pkg.price === "number" ? pkg.price : Number(pkg.price) || 0,
            duration: pkg.duration ?? "",
            description: pkg.description ?? "",
            features: pkg.features ?? [],
            active: typeof pkg.active === "boolean" ? pkg.active : true,
            createdAt: pkg.createdAt ?? now,
          };
          setPackages((prev) => [newPkg, ...prev]);
          showStatus("Package created.");
          resolve();
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error("createPackage failed", e);
          reject(e);
        } finally {
          // remove timer from pending list
          pendingTimersRef.current = pendingTimersRef.current.filter((t) => t !== timerId);
        }
      }, 250);
      pendingTimersRef.current.push(timerId);
    });
  }

  // Update package (simulated async)
  async function updatePackage(id: string, pkg: Partial<PackageItem>): Promise<void> {
    return new Promise((resolve, reject) => {
      const timerId = window.setTimeout(() => {
        try {
          setPackages((prev) => {
            const idx = prev.findIndex((p) => p.id === id);
            if (idx === -1) return prev;
            const updated: PackageItem = {
              ...prev[idx],
              ...pkg,
              title: pkg.title !== undefined ? pkg.title.trim() : prev[idx].title,
              price:
                pkg.price !== undefined
                  ? typeof pkg.price === "number"
                    ? pkg.price
                    : Number(pkg.price)
                  : prev[idx].price,
              features:
                pkg.features !== undefined
                  ? Array.isArray(pkg.features)
                    ? pkg.features
                    : prev[idx].features
                  : prev[idx].features,
            };
            const next = [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)];
            return next;
          });
          showStatus("Package updated.");
          resolve();
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error("updatePackage failed", e);
          reject(e);
        } finally {
          pendingTimersRef.current = pendingTimersRef.current.filter((t) => t !== timerId);
        }
      }, 250);
      pendingTimersRef.current.push(timerId);
    });
  }

  // Delete package (simulated async)
  async function deletePackage(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timerId = window.setTimeout(() => {
        try {
          setPackages((prev) => prev.filter((p) => p.id !== id));
          showStatus("Package deleted.");
          resolve();
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error("deletePackage failed", e);
          reject(e);
        } finally {
          pendingTimersRef.current = pendingTimersRef.current.filter((t) => t !== timerId);
        }
      }, 200);
      pendingTimersRef.current.push(timerId);
    });
  }

  // Handlers
  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      setError(null);
      const validation = validateForm();
      if (validation) {
        setError(validation);
        return;
      }

      const featuresArray = featuresText
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean);

      const payload: Partial<PackageItem> = {
        title: title.trim(),
        price: Number(price),
        duration: duration.trim(),
        description: description.trim(),
        features: featuresArray,
        active,
      };

      try {
        if (editingId) {
          await updatePackage(editingId, payload);
        } else {
          await createPackage(payload);
        }
        resetForm();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        setError("An unexpected error occurred. Try again.");
      }
    },
    [title, price, duration, description, featuresText, active, editingId]
  );

  function handleEdit(pkg: PackageItem) {
    setEditingId(pkg.id);
    setTitle(pkg.title);
    setPrice(pkg.price);
    setDuration(pkg.duration ?? "");
    setDescription(pkg.description ?? "");
    setFeaturesText((pkg.features ?? []).join("\n"));
    setActive(pkg.active);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const handleDelete = useCallback(
    async (id: string) => {
      const pkg = packages.find((p) => p.id === id);
      const name = pkg ? `"${pkg.title}"` : "this package";
      if (!window.confirm(`Delete ${name}? This action cannot be undone.`)) return;
      try {
        await deletePackage(id);
        if (editingId === id) resetForm();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        setError("Failed to delete package. Try again.");
      }
    },
    [packages, editingId]
  );

  const toggleActive = useCallback(
    async (id: string) => {
      const pkg = packages.find((p) => p.id === id);
      if (!pkg) return;
      try {
        await updatePackage(id, { active: !pkg.active });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        setError("Failed to update package state.");
      }
    },
    [packages]
  );

  return (
    <main className="package-manager" aria-labelledby="pm-heading">
      <header className="pm-header" style={{ padding: "1rem" }}>
        <h2 id="pm-heading" style={{ margin: 0, fontSize: "1.25rem" }}>
          Package Manager
        </h2>
        <p style={{ marginTop: "0.25rem", marginBottom: 0, color: "#666" }}>
          Create and edit packages for bookings. All data is stored locally in your browser.
        </p>
      </header>

      <section
        className="pm-form"
        aria-labelledby="pm-form-heading"
        style={{
          padding: "1rem",
          borderRadius: 8,
          background: "var(--card-background, #fff)",
          boxShadow: "var(--card-shadow, 0 1px 3px rgba(0,0,0,0.06))",
          margin: "1rem",
        }}
      >
        <h3 id="pm-form-heading" style={{ marginTop: 0 }}>
          {editingId ? "Edit Package" : "Create Package"}
        </h3>

        <form onSubmit={(e) => handleSubmit(e)} aria-describedby="pm-form-desc">
          <p id="pm-form-desc" style={{ marginTop: 0, marginBottom: "0.75rem", color: "#555" }}>
            Enter package details. Price is stored in your local browser.
          </p>

          <div style={{ display: "grid", gap: "0.5rem" }}>
            <label>
              <span style={{ display: "block", fontSize: "0.9rem" }}>Name *</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Wedding Basic"
                required
                aria-required
                style={{ width: "100%", padding: "0.5rem", marginTop: "0.25rem" }}
              />
            </label>

            <label>
              <span style={{ display: "block", fontSize: "0.9rem" }}>Price (USD) *</span>
              <input
                type="number"
                value={price === "" ? "" : price}
                onChange={(e) => setPrice(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="0.00"
                min={0}
                step="0.01"
                required
                aria-required
                style={{ width: "100%", padding: "0.5rem", marginTop: "0.25rem" }}
              />
            </label>

            <label>
              <span style={{ display: "block", fontSize: "0.9rem" }}>Duration (optional)</span>
              <input
                type="text"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="e.g. 2 hours"
                style={{ width: "100%", padding: "0.5rem", marginTop: "0.25rem" }}
              />
            </label>

            <label>
              <span style={{ display: "block", fontSize: "0.9rem" }}>Description (optional)</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short description for this package"
                rows={3}
                style={{ width: "100%", padding: "0.5rem", marginTop: "0.25rem" }}
              />
            </label>

            <label>
              <span style={{ display: "block", fontSize: "0.9rem" }}>
                Features (one per line, optional)
              </span>
              <textarea
                value={featuresText}
                onChange={(e) => setFeaturesText(e.target.value)}
                placeholder={"Unlimited prints\nOn-site attendant\nProps included"}
                rows={4}
                style={{ width: "100%", padding: "0.5rem", marginTop: "0.25rem" }}
              />
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                aria-checked={active}
              />
              <span style={{ fontSize: "0.95rem" }}>Active</span>
            </label>

            {error && (
              <div role="alert" style={{ color: "var(--error, #b00020)" }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                type="submit"
                style={{
                  padding: "0.5rem 0.75rem",
                  background: "var(--primary, #0b5fff)",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                }}
              >
                {editingId ? "Save changes" : "Add package"}
              </button>

              <button
                type="button"
                onClick={() => resetForm()}
                style={{
                  padding: "0.5rem 0.75rem",
                  background: "transparent",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                }}
              >
                Reset
              </button>

              {editingId && (
                <button
                  type="button"
                  onClick={() => {
                    if (!editingId) return;
                    handleDelete(editingId);
                  }}
                  style={{
                    padding: "0.5rem 0.75rem",
                    background: "var(--danger, #b00020)",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </form>
      </section>

      <section
        className="pm-list"
        aria-labelledby="pm-list-heading"
        style={{ padding: "1rem", margin: "1rem" }}
      >
        <h3 id="pm-list-heading" style={{ marginTop: 0 }}>
          Packages ({packages.length})
        </h3>

        {packages.length === 0 ? (
          <p style={{ color: "#666" }}>No packages yet. Add one using the form above.</p>
        ) : (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "grid",
              gap: "0.75rem",
            }}
          >
            {packages.map((pkg) => (
              <li
                key={pkg.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: "0.75rem",
                  borderRadius: 8,
                  background: "var(--item-bg, #fff)",
                  border: "1px solid rgba(0,0,0,0.06)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 8,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "baseline",
                        flexWrap: "wrap",
                      }}
                    >
                      <strong style={{ fontSize: "1rem" }}>{pkg.title}</strong>
                      <span style={{ color: "#444" }}>${pkg.price.toFixed(2)}</span>
                      {pkg.duration && <small style={{ color: "#666" }}>? {pkg.duration}</small>}
                    </div>
                    {pkg.description && (
                      <p style={{ margin: "0.25rem 0 0", color: "#555" }}>{pkg.description}</p>
                    )}
                    {pkg.features && pkg.features.length > 0 && (
                      <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1rem", color: "#444" }}>
                        {pkg.features.map((f, i) => (
                          <li key={`${f}-${i}`}>{f}</li>
                        ))}
                      </ul>
                    )}
                    <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => handleEdit(pkg)}
                        aria-label={`Edit ${pkg.title}`}
                        style={{
                          padding: "0.35rem 0.6rem",
                          borderRadius: 6,
                          border: "1px solid #ccc",
                          background: "transparent",
                        }}
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(pkg.id)}
                        aria-label={`Delete ${pkg.title}`}
                        style={{
                          padding: "0.35rem 0.6rem",
                          borderRadius: 6,
                          border: "1px solid #f3bdbd",
                          background: "var(--danger, #b00020)",
                          color: "white",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: 8,
                    }}
                  >
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={pkg.active}
                        onChange={() => toggleActive(pkg.id)}
                        aria-checked={pkg.active}
                        aria-label={`${pkg.title} ${pkg.active ? "active" : "inactive"}`}
                      />
                      <small style={{ color: "#666" }}>{pkg.active ? "Active" : "Inactive"}</small>
                    </label>
                    <time style={{ color: "#888", fontSize: "0.85rem" }}>
                      {new Date(pkg.createdAt).toLocaleString()}
                    </time>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div aria-live="polite" style={{ position: "fixed", left: -9999, top: "auto" }}>
        {statusMessage}
      </div>
    </main>
  );
}