function formatCurrency(value: number, currency?: string, locale?: string) {
  const loc = locale || (typeof navigator !== "undefined" ? navigator.language : "en-US");
  const curr = currency || "USD";
  try {
    return new Intl.NumberFormat(loc, { style: "currency", currency: curr }).format(value);
  } catch {
    // Fallback simple formatting
    return `${curr} ${value.toFixed(2)}`;
  }
}

function normalizeDiscount(pkg: PackageType) {
  const d = pkg.discount;
  if (d == null) return { type: "fixed" as const, value: 0 };
  if (typeof d === "number") return { type: "fixed" as const, value: d };
  return d;
}

function normalizeTax(pkg: PackageType) {
  const t = pkg.tax;
  if (t == null) return { type: "fixed" as const, value: 0 };
  if (typeof t === "number") return { type: "fixed" as const, value: t };
  return t;
}

function calculateBreakdown(pkg: PackageType) {
  const base = Math.max(0, Number(pkg.basePrice) || 0);
  const travel = Math.max(0, Number(pkg.travelFee) || 0);
  const addons = (pkg.addOns || []).map((a) => ({
    ...a,
    price: Math.max(0, Number(a.price) || 0),
    quantity: Math.max(1, Math.floor(Number(a.quantity) || 1)),
  }));

  const addonsTotal = addons.reduce((s, a) => s + a.price * a.quantity!, 0);

  const subtotalBeforeDiscountAndTax = base + addonsTotal + travel;

  const discount = normalizeDiscount(pkg);
  let discountAmount = 0;
  if (discount.type === "percent") {
    discountAmount = (subtotalBeforeDiscountAndTax * Math.max(0, discount.value)) / 100;
  } else {
    discountAmount = Math.max(0, discount.value);
  }
  if (discountAmount > subtotalBeforeDiscountAndTax) discountAmount = subtotalBeforeDiscountAndTax;

  const tax = normalizeTax(pkg);
  let taxAmount = 0;
  if (tax.type === "percent") {
    taxAmount = ((subtotalBeforeDiscountAndTax - discountAmount) * Math.max(0, tax.value)) / 100;
  } else {
    taxAmount = Math.max(0, tax.value);
  }

  const total = Math.max(0, subtotalBeforeDiscountAndTax - discountAmount + taxAmount);

  return {
    base,
    travel,
    addons,
    addonsTotal,
    subtotalBeforeDiscountAndTax,
    discountAmount,
    taxAmount,
    total,
  };
}

export function PackagePriceBreakdown({ pkg }: { pkg: PackageType }) {
  const breakdown = useMemo(() => calculateBreakdown(pkg), [pkg]);
  const { base, travel, addons, addonsTotal, subtotalBeforeDiscountAndTax, discountAmount, taxAmount, total } =
    breakdown;

  return (
    <div className="pkg-price-breakdown" aria-live="polite" id={`pkg-${pkg.id}-details`}>
      <dl className="breakdown-list" style={{ margin: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
          <dt style={{ fontSize: 14, color: "var(--muted-text, #555)" }}>Base price</dt>
          <dd style={{ fontSize: 14, margin: 0 }}>{formatCurrency(base, pkg.currency)}</dd>
        </div>

        {addons.length > 0 && (
          <div style={{ padding: "6px 0" }}>
            <dt style={{ fontSize: 14, color: "var(--muted-text, #555)" }}>Add-ons</dt>
            <dd style={{ margin: "6px 0 0 0" }}>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {addons.map((a, index) => (
                  <li
                    key={a.id ?? `${a.name}-${a.price}-${index}`}
                    style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "2px 0" }}
                  >
                    <span>{a.quantity && a.quantity > 1 ? `${a.name} ? ${a.quantity}` : a.name}</span>
                    <span>{formatCurrency(a.price * (a.quantity || 1), pkg.currency)}</span>
                  </li>
                ))}
                <li style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, paddingTop: 6 }}>
                  <span>Total add-ons</span>
                  <span>{formatCurrency(addonsTotal, pkg.currency)}</span>
                </li>
              </ul>
            </dd>
          </div>
        )}

        {travel > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
            <dt style={{ fontSize: 14, color: "var(--muted-text, #555)" }}>Travel fee</dt>
            <dd style={{ fontSize: 14, margin: 0 }}>{formatCurrency(travel, pkg.currency)}</dd>
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "6px 0",
            borderTop: "1px dashed var(--muted-border, #e0e0e0)",
            marginTop: 8,
          }}
        >
          <dt style={{ fontSize: 14, color: "var(--muted-text, #555)" }}>Subtotal</dt>
          <dd style={{ fontSize: 14, margin: 0 }}>{formatCurrency(subtotalBeforeDiscountAndTax, pkg.currency)}</dd>
        </div>

        {discountAmount > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
            <dt style={{ fontSize: 14, color: "var(--discount-text, #0a7a0a)" }}>Discount</dt>
            <dd style={{ fontSize: 14, color: "var(--discount-text, #0a7a0a)", margin: 0 }}>
              -{formatCurrency(discountAmount, pkg.currency)}
            </dd>
          </div>
        )}

        {taxAmount > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
            <dt style={{ fontSize: 14, color: "var(--muted-text, #555)" }}>Tax</dt>
            <dd style={{ fontSize: 14, margin: 0 }}>{formatCurrency(taxAmount, pkg.currency)}</dd>
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "8px 0",
            borderTop: "2px solid var(--muted-border, #e0e0e0)",
            marginTop: 8,
          }}
        >
          <dt style={{ fontSize: 16, fontWeight: 700 }}>Total</dt>
          <dd style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{formatCurrency(total, pkg.currency)}</dd>
        </div>
      </dl>
    </div>
  );
}

export default function PackageCard(props: { pkg: PackageType; onSelect?: (id?: string) => void }) {
  const { pkg, onSelect } = props;

  const breakdown = useMemo(() => calculateBreakdown(pkg), [pkg]);

  const handleSelect = useCallback(
    (e?: React.MouseEvent | React.KeyboardEvent) => {
      if (e && "preventDefault" in e) e.preventDefault();
      if (onSelect) onSelect(pkg.id);
    },
    [onSelect, pkg.id]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      // Only act when the article itself is focused (avoid double activation when interactive children are focused)
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleSelect(e);
      }
    },
    [handleSelect]
  );

  const [detailsOpen, setDetailsOpen] = useState(false);

  const accentStyle =
    pkg.color
      ? { borderLeft: `4px solid ${pkg.color}` }
      : pkg.featured
      ? { borderLeft: `4px solid var(--accent, #3b82f6)` }
      : undefined;

  return (
    <article
      className={`package-card ${pkg.featured ? "featured" : ""}`}
      style={{
        background: "var(--card-bg, #fff)",
        color: "var(--text, #111)",
        borderRadius: 8,
        padding: 12,
        boxShadow: "var(--card-shadow, 0 1px 4px rgba(0,0,0,0.06))",
        marginBottom: 12,
        ...accentStyle,
      }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={(e: React.MouseEvent<HTMLElement>) => {
        // Only select when clicking the article's non-interactive area
        if (e.target === e.currentTarget) {
          handleSelect(e);
        }
      }}
      aria-labelledby={`pkg-${pkg.id}-title`}
    >
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h3
            id={`pkg-${pkg.id}-title`}
            style={{ margin: 0, fontSize: 18, lineHeight: 1.2, display: "flex", alignItems: "center", gap: 8 }}
          >
            <span>{pkg.name}</span>
            {pkg.featured && (
              <span
                style={{
                  background: "var(--accent, #3b82f6)",
                  color: "white",
                  fontSize: 12,
                  padding: "2px 6px",
                  borderRadius: 999,
                }}
                aria-hidden
              >
                Featured
              </span>
            )}
          </h3>
          {pkg.description && (
            <p style={{ margin: "6px 0 0 0", color: "var(--muted-text, #666)", fontSize: 14 }}>{pkg.description}</p>
          )}

          <ul style={{ display: "flex", gap: 8, margin: "10px 0 0 0", padding: 0, listStyle: "none", flexWrap: "wrap" }}>
            {pkg.durationMinutes != null && (
              <li
                style={{
                  background: "var(--chip-bg, #f3f4f6)",
                  color: "var(--chip-text, #111)",
                  padding: "4px 8px",
                  borderRadius: 999,
                  fontSize: 13,
                }}
              >
                {Math.floor(pkg.durationMinutes / 60) > 0
                  ? `${Math.floor(pkg.durationMinutes / 60)}h ${pkg.durationMinutes % 60}m`
                  : `${pkg.durationMinutes}m`}
              </li>
            )}
            {pkg.maxGuests != null && (
              <li
                style={{
                  background: "var(--chip-bg, #f3f4f6)",
                  color: "var(--chip-text, #111)",
                  padding: "4px 8px",
                  borderRadius: 999,
                  fontSize: 13,
                }}
              >
                Up to {pkg.maxGuests}
              </li>
            )}
            {pkg.includedPrints != null && (
              <li
                style={{
                  background: "var(--chip-bg, #f3f4f6)",
                  color: "var(--chip-text, #111)",
                  padding: "4px 8px",
                  borderRadius: 999,
                  fontSize: 13,
                }}
              >
                {pkg.includedPrints} prints
              </li>
            )}
            {pkg.digitalCopies != null && (
              <li
                style={{
                  background: "var(--chip-bg, #f3f4f6)",
                  color: "var(--chip-text, #111)",
                  padding: "4px 8px",
                  borderRadius: 999,
                  fontSize: 13,
                }}
              >
                {pkg.digitalCopies} digital
              </li>
            )}
          </ul>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, minWidth: 120 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 14, color: "var(--muted-text, #666)" }}>From</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{formatCurrency(breakdown.total, pkg.currency)}</div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={(e) => {
                // Stop propagation so article-level handlers don't treat this as a package select
                e.stopPropagation();
                handleSelect(e);
              }}
              onKeyDown={(e) => {
                // Prevent space from scrolling the page but let the button handle activation
                if (e.key === " ") e.preventDefault();
              }}
              className="pkg-select-btn"
              aria-label={`Select package ${pkg.name}`}
              style={{
                background: "var(--primary, #111827)",
                color: "var(--primary-contrast, #fff)",
                border: "none",
                padding: "8px 12px",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              Select
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDetailsOpen((d) => !d);
              }}
              aria-pressed={detailsOpen}
              aria-controls={`pkg-${pkg.id}-details`}
              style={{
                background: "transparent",
                border: "1px solid var(--muted-border, #e0e0e0)",
                color: "var(--text, #111)",
                padding: "6px 10px",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              Details
            </button>
          </div>
        </div>
      </header>

      <div style={{ marginTop: 12 }}>{detailsOpen && <PackagePriceBreakdown pkg={pkg} />}</div>
    </article>
  );
}