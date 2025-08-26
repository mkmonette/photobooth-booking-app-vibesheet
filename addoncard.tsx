function AddonCard({ addon, onToggle, currency: currencyOverride }: Props): JSX.Element {
  const safeAddon: Addon = addon || ({ id: "", name: "Addon", price: 0 } as Addon);
  const {
    id = "",
    name = "Addon",
    description,
    price = 0,
    selected: selectedProp,
    disabled = false,
  } = safeAddon;

  // Treat the component as controlled only when the parent provides both:
  //  - an onToggle handler (to update selection), AND
  //  - an explicit selected value on the addon prop.
  const isControlled = typeof onToggle === "function" && typeof selectedProp !== "undefined";

  const [selectedLocal, setSelectedLocal] = useState<boolean>(!!selectedProp);

  // When uncontrolled, keep local state in sync with incoming prop if it changes.
  useEffect(() => {
    if (!isControlled) {
      setSelectedLocal(!!selectedProp);
    }
  }, [selectedProp, isControlled]);

  const selected = isControlled ? !!selectedProp : selectedLocal;

  const handleToggle = useCallback(
    (e?: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled || !id) return;
      if (onToggle && isControlled) {
        onToggle(id);
      } else {
        setSelectedLocal((s) => !s);
      }
    },
    [disabled, id, isControlled, onToggle]
  );

  const currency = (safeAddon as any).currency || currencyOverride || "USD";

  const formattedPrice = useMemo(() => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(price || 0);
    } catch {
      return `$${(price || 0).toFixed(2)}`;
    }
  }, [price, currency]);

  return (
    <div
      className={`addon-card ${selected ? "addon-card--selected" : ""} ${disabled ? "addon-card--disabled" : ""}`}
      role="group"
      aria-disabled={disabled}
      aria-label={name}
    >
      <button
        type="button"
        className="addon-card__button"
        onClick={handleToggle}
        aria-pressed={selected}
        disabled={disabled}
        aria-label={`${name} ${selected ? "selected" : "not selected"}`}
      >
        <div className="addon-card__content">
          <div className="addon-card__left">
            <div className="addon-card__thumb" aria-hidden>
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                <rect width="24" height="24" rx="4" fill={selected ? "#0ea5a4" : "#e6f7f6"} />
                <path d="M7 12h10" stroke={selected ? "#fff" : "#0f172a"} strokeWidth="1.5" strokeLinecap="round" />
                <path d="M7 8h6" stroke={selected ? "#fff" : "#0f172a"} strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>

            <div className="addon-card__info">
              <div className="addon-card__title">{name}</div>
              {description ? <div className="addon-card__desc">{description}</div> : null}
            </div>
          </div>

          <div className="addon-card__right" aria-hidden>
            <div className="addon-card__price">{formattedPrice}</div>

            <div className="addon-card__indicator" aria-hidden>
              {selected ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                  <circle cx="12" cy="12" r="10" fill="#059669" />
                  <path d="M7 13l2.5 2.5L17 8" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                  <rect x="2" y="2" width="20" height="20" rx="4" stroke="#94a3b8" strokeWidth="1.5" fill="transparent" />
                </svg>
              )}
            </div>
          </div>
        </div>
      </button>

      <style jsx>{`
        .addon-card {
          margin: 0.5rem 0;
          border-radius: 10px;
        }
        .addon-card__button {
          width: 100%;
          text-align: left;
          background: transparent;
          border: none;
          padding: 0;
          cursor: pointer;
        }
        .addon-card__button:disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }
        .addon-card__content {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem;
          border-radius: 10px;
          transition: background 160ms, box-shadow 160ms;
          background: var(--card-bg, #ffffff);
          box-shadow: 0 1px 2px rgba(2,6,23,0.06);
        }
        .addon-card--selected .addon-card__content {
          background: linear-gradient(90deg, rgba(6,182,212,0.06), rgba(14,165,132,0.03));
          box-shadow: 0 4px 12px rgba(6,182,212,0.08);
        }
        .addon-card__left {
          display: flex;
          gap: 0.75rem;
          align-items: center;
        }
        .addon-card__thumb {
          width: 44px;
          height: 44px;
          flex: 0 0 44px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .addon-card__info {
          display: flex;
          flex-direction: column;
        }
        .addon-card__title {
          font-weight: 600;
          color: var(--text-primary, #0f172a);
          font-size: 0.95rem;
        }
        .addon-card__desc {
          margin-top: 2px;
          font-size: 0.85rem;
          color: var(--text-muted, #64748b);
        }
        .addon-card__right {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .addon-card__price {
          font-weight: 600;
          color: var(--text-primary, #0f172a);
          font-size: 0.95rem;
        }
        .addon-card__indicator {
          display: flex;
          align-items: center;
        }
        @media (prefers-color-scheme: dark) {
          .addon-card__content {
            background: var(--card-bg-dark, #0b1220);
            box-shadow: none;
          }
          .addon-card__title {
            color: #e6eef8;
          }
          .addon-card__desc {
            color: #9aa7bd;
          }
        }
      `}</style>
    </div>
  );
}

export default React.memo(AddonCard);