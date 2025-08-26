const STORAGE_KEY = "photobooth_addons_v2";
const SIMULATED_DELAY_MS = 150;

export interface Addon {
  id: string;
  name: string;
  price: number;
  description: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

type EditValues = {
  name?: string;
  price?: string; // keep as string in form state, convert when saving
  description?: string;
  active?: boolean;
};

function generateId(): string {
  // Simple RFC4122-like fallback: timestamp + random
  return Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 9);
}

function safeParse(raw: string | null): Addon[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

function readAllAddons(): Addon[] {
  try {
    if (typeof window === "undefined" || !window.localStorage) return [];
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return safeParse(raw);
  } catch {
    return [];
  }
}

function writeAllAddons(list: Addon[]) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // no-op on write failure
  }
}

function delay<T>(ms = SIMULATED_DELAY_MS, value?: T) {
  return new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
}

export async function createAddon(addon: Partial<Addon>): Promise<void> {
  const now = new Date().toISOString();
  const item: Addon = {
    id: generateId(),
    name: (addon.name || "").trim(),
    price: typeof addon.price === "number" ? addon.price : 0,
    description: (addon.description || "").trim(),
    active: typeof addon.active === "boolean" ? addon.active : true,
    createdAt: now,
    updatedAt: now,
  };

  // Minimal validation
  if (!item.name) throw new Error("Name is required for addon.");
  if (Number.isNaN(item.price) || item.price < 0) {
    throw new Error("Price must be a non-negative number.");
  }

  const list = readAllAddons();
  list.push(item);
  writeAllAddons(list);
  await delay();
}

export async function updateAddon(id: string, addon: Partial<Addon>): Promise<void> {
  const list = readAllAddons();
  const idx = list.findIndex((a) => a.id === id);
  if (idx === -1) throw new Error("Addon not found.");
  const existing = list[idx];

  const updated: Addon = {
    ...existing,
    name: typeof addon.name === "string" ? addon.name.trim() : existing.name,
    price: typeof addon.price === "number" ? addon.price : existing.price,
    description:
      typeof addon.description === "string" ? addon.description.trim() : existing.description,
    active: typeof addon.active === "boolean" ? addon.active : existing.active,
    updatedAt: new Date().toISOString(),
  };

  if (!updated.name) throw new Error("Name is required for addon.");
  if (Number.isNaN(updated.price) || updated.price < 0) {
    throw new Error("Price must be a non-negative number.");
  }

  list[idx] = updated;
  writeAllAddons(list);
  await delay();
}

export async function deleteAddon(id: string): Promise<void> {
  const list = readAllAddons();
  const filtered = list.filter((a) => a.id !== id);
  if (filtered.length === list.length) throw new Error("Addon not found.");
  writeAllAddons(filtered);
  await delay();
}

export default function AddonManager(): JSX.Element {
  const [addons, setAddons] = useState<Addon[]>([]);
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Add form state
  const [name, setName] = useState("");
  const [price, setPrice] = useState<string>("0.00");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const addNameRef = useRef<HTMLInputElement | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<EditValues>({});

  // Theme toggle (light/dark) simple
  const [dark, setDark] = useState<boolean>(() => {
    try {
      if (typeof window === "undefined" || !window.localStorage) return false;
      return window.localStorage.getItem("photobooth_theme") === "dark";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem("photobooth_theme", dark ? "dark" : "light");
      }
    } catch {
      // ignore
    }
  }, [dark]);

  async function reload() {
    setLoading(true);
    setGlobalError(null);
    try {
      // simulate small delay for read
      await delay();
      const list = readAllAddons();
      // sort by createdAt desc
      list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      setAddons(list);
    } catch (err: any) {
      setGlobalError(err?.message || "Failed to load addons.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  function resetAddForm() {
    setName("");
    setPrice("0.00");
    setDescription("");
    setActive(true);
    addNameRef.current?.focus();
  }

  async function handleCreate(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setGlobalError(null);
    const parsedPrice = parseFloat(price === "" ? "0" : price);
    if (!name.trim()) {
      setGlobalError("Please enter a name for the addon.");
      addNameRef.current?.focus();
      return;
    }
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      setGlobalError("Please enter a valid non-negative price.");
      return;
    }

    setLoading(true);
    try {
      await createAddon({
        name: name.trim(),
        price: Math.round(parsedPrice * 100) / 100,
        description: description.trim(),
        active,
      });
      await reload();
      resetAddForm();
    } catch (err: any) {
      setGlobalError(err?.message || "Failed to create addon.");
    } finally {
      setLoading(false);
    }
  }

  function startEdit(item: Addon) {
    setEditingId(item.id);
    setEditValues({
      name: item.name,
      price: item.price != null ? item.price.toFixed(2) : "0.00",
      description: item.description,
      active: item.active,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValues({});
  }

  async function handleSaveEdit(id: string) {
    setGlobalError(null);
    const newName = (editValues.name || "").toString().trim();
    const newPrice = parseFloat(String(editValues.price || "0"));
    const newDescription = (editValues.description || "").toString().trim();
    const newActive = typeof editValues.active === "boolean" ? editValues.active : true;

    if (!newName) {
      setGlobalError("Name is required.");
      return;
    }
    if (Number.isNaN(newPrice) || newPrice < 0) {
      setGlobalError("Price must be a non-negative number.");
      return;
    }

    setLoading(true);
    try {
      await updateAddon(id, {
        name: newName,
        price: Math.round(newPrice * 100) / 100,
        description: newDescription,
        active: newActive,
      });
      await reload();
      cancelEdit();
    } catch (err: any) {
      setGlobalError(err?.message || "Failed to update addon.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    setGlobalError(null);
    const confirmed = typeof window !== "undefined" ? window.confirm("Delete this addon? This action cannot be undone.") : true;
    if (!confirmed) return;
    setLoading(true);
    try {
      await deleteAddon(id);
      await reload();
    } catch (err: any) {
      setGlobalError(err?.message || "Failed to delete addon.");
    } finally {
      setLoading(false);
    }
  }

  function formatCurrency(n: number) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n);
    } catch {
      return `$${n.toFixed(2)}`;
    }
  }

  return (
    <div
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "1rem",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
        color: dark ? "#e6eef8" : "#0b1a2b",
      }}
      aria-live="polite"
    >
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Add-ons</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => {
              setDark((d) => !d);
            }}
            aria-pressed={dark}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid rgba(0,0,0,0.08)",
              background: dark ? "#0f1724" : "#fff",
              color: dark ? "#cfe8ff" : "#0b1a2b",
              cursor: "pointer",
            }}
            title="Toggle theme"
          >
            {dark ? "Dark" : "Light"}
          </button>
        </div>
      </header>

      <section
        aria-labelledby="add-addon-heading"
        style={{
          marginTop: 12,
          padding: 12,
          borderRadius: 8,
          background: dark ? "#071326" : "#f7fbff",
          boxShadow: dark ? "0 1px 0 rgba(255,255,255,0.02) inset" : "0 1px 4px rgba(12,18,26,0.04)",
        }}
      >
        <h3 id="add-addon-heading" style={{ margin: "0 0 8px 0", fontSize: "1rem" }}>
          Create new add-on
        </h3>

        <form onSubmit={(e) => handleCreate(e)} style={{ display: "grid", gap: 8 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12 }}>Name</span>
            <input
              ref={addNameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Extra Prints"
              aria-label="Addon name"
              required
              style={{
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid rgba(0,0,0,0.12)",
                background: dark ? "#071326" : "#fff",
                color: dark ? "#e6eef8" : "#0b1a2b",
              }}
            />
          </label>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ flex: "1 1 160px", display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12 }}>Price</span>
              <input
                inputMode="decimal"
                value={price}
                onChange={(e) => {
                  // allow only valid numeric input characters
                  const v = e.target.value;
                  if (/^[0-9]*[.]?[0-9]{0,2}$/.test(v) || v === "") {
                    setPrice(v);
                  }
                }}
                aria-label="Addon price"
                style={{
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "1px solid rgba(0,0,0,0.12)",
                  background: dark ? "#071326" : "#fff",
                  color: dark ? "#e6eef8" : "#0b1a2b",
                }}
              />
            </label>

            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                id="add-active"
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                aria-label="Addon active"
              />
              <span style={{ fontSize: 12 }}>Active</span>
            </label>
          </div>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12 }}>Description (optional)</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description for the addon"
              aria-label="Addon description"
              style={{
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid rgba(0,0,0,0.12)",
                background: dark ? "#071326" : "#fff",
                color: dark ? "#e6eef8" : "#0b1a2b",
              }}
            />
          </label>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                background: "#0b69ff",
                color: "#fff",
                border: "none",
                cursor: loading ? "wait" : "pointer",
              }}
            >
              Add
            </button>

            <button
              type="button"
              onClick={resetAddForm}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                background: dark ? "#0b2a44" : "#fff",
                color: dark ? "#cfe8ff" : "#0b1a2b",
                border: "1px solid rgba(0,0,0,0.06)",
                cursor: "pointer",
              }}
            >
              Reset
            </button>
          </div>

          {globalError && (
            <div
              role="alert"
              style={{
                marginTop: 6,
                color: "#b91c1c",
                fontSize: 13,
              }}
            >
              {globalError}
            </div>
          )}
        </form>
      </section>

      <section aria-labelledby="list-heading" style={{ marginTop: 16 }}>
        <h3 id="list-heading" style={{ margin: "0 0 8px 0", fontSize: "1rem" }}>
          Existing add-ons
        </h3>

        <div
          style={{
            display: "grid",
            gap: 8,
          }}
        >
          {loading && addons.length === 0 ? (
            <div style={{ padding: 12, borderRadius: 8, background: dark ? "#071326" : "#fff" }}>
              Loading...
            </div>
          ) : addons.length === 0 ? (
            <div
              style={{
                padding: 12,
                borderRadius: 8,
                background: dark ? "#071326" : "#fff",
                color: dark ? "#9fc9ff" : "#4b5563",
              }}
            >
              No add-ons yet.
            </div>
          ) : (
            addons.map((a) => {
              const isEditing = editingId === a.id;
              return (
                <div
                  key={a.id}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    background: dark ? "#071326" : "#fff",
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 8,
                    alignItems: "center",
                    border: "1px solid rgba(0,0,0,0.04)",
                  }}
                >
                  <div>
                    {isEditing ? (
                      <div style={{ display: "grid", gap: 8 }}>
                        <label style={{ display: "grid", gap: 6 }}>
                          <span style={{ fontSize: 12 }}>Name</span>
                          <input
                            value={String(editValues.name ?? "")}
                            onChange={(e) => setEditValues((s) => ({ ...s, name: e.target.value }))}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 6,
                              border: "1px solid rgba(0,0,0,0.12)",
                              background: dark ? "#071326" : "#fff",
                              color: dark ? "#e6eef8" : "#0b1a2b",
                            }}
                          />
                        </label>

                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <label style={{ flex: "1 1 160px", display: "grid", gap: 6 }}>
                            <span style={{ fontSize: 12 }}>Price</span>
                            <input
                              inputMode="decimal"
                              value={String(editValues.price ?? "")}
                              onChange={(e) => {
                                const v = e.target.value;
                                // accept digits, dot and optional decimals
                                if (/^[0-9]*[.]?[0-9]{0,2}$/.test(v) || v === "") {
                                  setEditValues((s) => ({ ...s, price: v }));
                                }
                              }}
                              style={{
                                padding: "8px 10px",
                                borderRadius: 6,
                                border: "1px solid rgba(0,0,0,0.12)",
                                background: dark ? "#071326" : "#fff",
                                color: dark ? "#e6eef8" : "#0b1a2b",
                              }}
                            />
                          </label>

                          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <input
                              type="checkbox"
                              checked={Boolean(editValues.active)}
                              onChange={(e) => setEditValues((s) => ({ ...s, active: e.target.checked }))}
                            />
                            <span style={{ fontSize: 12 }}>Active</span>
                          </label>
                        </div>

                        <label style={{ display: "grid", gap: 6 }}>
                          <span style={{ fontSize: 12 }}>Description</span>
                          <input
                            value={String(editValues.description ?? "")}
                            onChange={(e) => setEditValues((s) => ({ ...s, description: e.target.value }))}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 6,
                              border: "1px solid rgba(0,0,0,0.12)",
                              background: dark ? "#071326" : "#fff",
                              color: dark ? "#e6eef8" : "#0b1a2b",
                            }}
                          />
                        </label>

                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => handleSaveEdit(a.id)}
                            disabled={loading}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 8,
                              background: "#0b69ff",
                              color: "#fff",
                              border: "none",
                              cursor: "pointer",
                            }}
                          >
                            Save
                          </button>
                          <button
                            onClick={() => cancelEdit()}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 8,
                              background: dark ? "#0b2a44" : "#fff",
                              color: dark ? "#cfe8ff" : "#0b1a2b",
                              border: "1px solid rgba(0,0,0,0.06)",
                              cursor: "pointer",
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                          <strong style={{ fontSize: 14 }}>{a.name}</strong>
                          <span style={{ fontSize: 13, color: dark ? "#9fc9ff" : "#0b1a2b" }}>{formatCurrency(a.price)}</span>
                        </div>
                        {a.description && (
                          <div style={{ marginTop: 6, fontSize: 13, color: dark ? "#9fc9ff" : "#475569" }}>
                            {a.description}
                          </div>
                        )}
                        <div style={{ marginTop: 6, fontSize: 12, color: a.active ? "#0b1a2b" : "#6b7280" }}>
                          {a.active ? "Active" : "Inactive"} ? Created {new Date(a.createdAt).toLocaleString()}
                        </div>
                      </div>
                    )}
                  </div>

                  {!isEditing && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button
                        onClick={() => startEdit(a)}
                        aria-label={`Edit ${a.name}`}
                        style={{
                          padding: "6px 8px",
                          borderRadius: 8,
                          background: dark ? "#062437" : "#fff",
                          border: "1px solid rgba(0,0,0,0.06)",
                          cursor: "pointer",
                        }}
                      >
                        Edit
                      </button>

                      <button
                        onClick={() => handleDelete(a.id)}
                        aria-label={`Delete ${a.name}`}
                        style={{
                          padding: "6px 8px",
                          borderRadius: 8,
                          background: "#ffe9e9",
                          border: "1px solid #f2b1b1",
                          color: "#7a1a1a",
                          cursor: "pointer",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}