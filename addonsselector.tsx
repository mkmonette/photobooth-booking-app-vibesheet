function sanitizeId(id: string) {
  return String(id).replace(/\s+/g, "-").replace(/[^A-Za-z0-9-_:.]/g, "");
}

function formatPrice(value: number | undefined, currency = "USD") {
  if (value == null || Number.isNaN(Number(value))) return "";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(Number(value));
  } catch {
    // fallback
    return `${currency} ${Number(value).toFixed(2)}`;
  }
}

export interface AddonItem {
  id?: string | number;
  name?: string;
  description?: string;
  price?: number;
  disabled?: boolean;
  [key: string]: any;
}

export interface Props {
  available?: Array<AddonItem | string | number | Record<string, any>>;
  selected?: string[];
  onToggle?: (id: string) => void;
  className?: string;
  currency?: string;
}

function AddonsSelector(props: Props): JSX.Element {
  const { available, selected, onToggle, className = "", currency = "USD" } = props;

  // internalSelected is used when no onToggle handler is provided (uncontrolled mode)
  const [internalSelected, setInternalSelected] = useState<Set<string>>(
    () => new Set(Array.isArray(selected) ? selected : [])
  );

  // keep internal in sync if parent changes selected prop
  useEffect(() => {
    if (Array.isArray(selected)) {
      setInternalSelected(new Set(selected));
    }
  }, [selected]);

  const isControlled = typeof onToggle === "function";

  const selectedSet = useMemo(
    () => (isControlled ? new Set(Array.isArray(selected) ? selected : []) : internalSelected),
    [isControlled, selected, internalSelected]
  );

  const handleToggle = useCallback(
    (id: string) => {
      if (isControlled) {
        onToggle?.(id);
        return;
      }
      setInternalSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      // still call onToggle if provided (defensive)
      onToggle?.(id);
    },
    [isControlled, onToggle]
  );

  if (!Array.isArray(available)) {
    return <div className={`addons-selector ${className}`}>No add-ons available.</div>;
  }

  return (
    <div className={`addons-selector ${className}`}>
      <ul className="addons-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {available.map((raw, index) => {
          // normalize item shape to expected fields with fallbacks
          const item: AddonItem =
            raw && typeof raw === "object" && !Array.isArray(raw)
              ? (raw as AddonItem)
              : {
                  id: raw,
                  name: String(raw),
                };

          const id = String(item.id ?? item.name ?? index);
          const key = id || `addon-${index}`;
          const inputId = `addon-checkbox-${sanitizeId(String(id)) || index}`;
          const checked = selectedSet.has(id);
          const disabled = Boolean(item.disabled);

          const handleChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
            if (disabled) return;
            handleToggle(id);
          };

          return (
            <li
              key={key}
              className={`addon-item ${checked ? "is-selected" : ""} ${disabled ? "is-disabled" : ""}`}
              style={{ marginBottom: 8 }}
            >
              <label
                htmlFor={inputId}
                className="addon-row"
                aria-disabled={disabled || undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 12,
                  borderRadius: 8,
                  cursor: disabled ? "not-allowed" : "pointer",
                  border: checked ? "1px solid #0078d4" : "1px solid rgba(0,0,0,0.08)",
                  background: checked ? "rgba(0,120,212,0.06)" : "transparent",
                  margin: 0,
                  width: "100%",
                  boxSizing: "border-box",
                }}
              >
                <input
                  id={inputId}
                  type="checkbox"
                  className="addon-checkbox"
                  checked={checked}
                  onChange={handleChange}
                  disabled={disabled}
                  aria-labelledby={`${inputId}-label`}
                  style={{ width: 20, height: 20, flex: "0 0 20px" }}
                />

                <div className="addon-details" style={{ flex: "1 1 auto", minWidth: 0 }}>
                  <div
                    id={`${inputId}-label`}
                    className="addon-name"
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color: "var(--text-color, #111827)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {item.name ?? "Unnamed add-on"}
                  </div>
                  {item.description ? (
                    <div
                      className="addon-desc"
                      style={{
                        fontSize: 13,
                        color: "var(--muted-text, #6b7280)",
                        marginTop: 4,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {item.description}
                    </div>
                  ) : null}
                </div>

                {typeof item.price === "number" ? (
                  <div
                    className="addon-price"
                    style={{
                      marginLeft: 12,
                      flex: "0 0 auto",
                      fontSize: 14,
                      color: "var(--muted-text, #374151)",
                      fontWeight: 600,
                    }}
                  >
                    {formatPrice(item.price, currency)}
                  </div>
                ) : null}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default memo(AddonsSelector);