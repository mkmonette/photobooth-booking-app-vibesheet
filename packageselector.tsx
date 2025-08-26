export function filterPackages(packages: PackageItem[], criteria: FilterCriteria): PackageItem[] {
  if (!Array.isArray(packages)) return [];

  const {
    search,
    category,
    minPrice,
    maxPrice,
    sortBy = "recommended",
    activeOnly = false,
  } = criteria || {};

  const searchTerm = typeof search === "string" && search.trim() !== "" ? search.trim().toLowerCase() : null;

  const parsedMin = typeof minPrice === "number" ? minPrice : null;
  const parsedMax = typeof maxPrice === "number" ? maxPrice : null;

  let results = packages.filter((pkg) => {
    if (!pkg) return false;
    if (activeOnly && pkg.active === false) return false;
    if (category && category !== "all" && pkg.category !== category) return false;

    if (parsedMin !== null && typeof pkg.price === "number" && pkg.price < parsedMin) return false;
    if (parsedMax !== null && typeof pkg.price === "number" && pkg.price > parsedMax) return false;

    if (searchTerm) {
      const haystackParts: string[] = [];
      if (typeof pkg.name === "string") haystackParts.push(pkg.name);
      if (typeof pkg.description === "string") haystackParts.push(pkg.description);
      if (Array.isArray(pkg.features)) haystackParts.push(pkg.features.join(" "));
      if (typeof pkg.category === "string") haystackParts.push(pkg.category);
      if (typeof pkg.duration === "string") haystackParts.push(pkg.duration);

      const haystack = haystackParts.join(" ").toLowerCase();
      if (!haystack.includes(searchTerm)) return false;
    }

    return true;
  });

  const durationToMinutes = (d?: string | number): number => {
    if (!d) return Number.MAX_SAFE_INTEGER;
    if (typeof d === "number") return d;
    const hoursMatch = d.match(/(\d+)\s*h/);
    const minsMatch = d.match(/(\d+)\s*m/);
    const onlyNumber = d.match(/^(\d+)$/);
    let minutes = 0;
    if (hoursMatch) minutes += parseInt(hoursMatch[1], 10) * 60;
    if (minsMatch) minutes += parseInt(minsMatch[1], 10);
    if (!hoursMatch && !minsMatch && onlyNumber) minutes = parseInt(onlyNumber[1], 10);
    return minutes || Number.MAX_SAFE_INTEGER;
  };

  switch (sortBy) {
    case "priceAsc":
      results = results.slice().sort((a, b) => (Number(a.price ?? Infinity) - Number(b.price ?? Infinity)));
      break;
    case "priceDesc":
      results = results.slice().sort((a, b) => (Number(b.price ?? -Infinity) - Number(a.price ?? -Infinity)));
      break;
    case "nameAsc":
      results = results.slice().sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), undefined, { sensitivity: "base" }));
      break;
    case "nameDesc":
      results = results.slice().sort((a, b) => String(b.name ?? "").localeCompare(String(a.name ?? ""), undefined, { sensitivity: "base" }));
      break;
    case "durationAsc":
      results = results.slice().sort((a, b) => durationToMinutes(a.duration) - durationToMinutes(b.duration));
      break;
    case "durationDesc":
      results = results.slice().sort((a, b) => durationToMinutes(b.duration) - durationToMinutes(a.duration));
      break;
    case "recommended":
    default:
      results = results.slice().sort((a, b) => {
        const aActive = a.active ? 0 : 1;
        const bActive = b.active ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        const aPrice = typeof a.price === "number" ? a.price : Infinity;
        const bPrice = typeof b.price === "number" ? b.price : Infinity;
        if (aPrice !== bPrice) return aPrice - bPrice;
        return String(a.name ?? "").localeCompare(String(b.name ?? ""), undefined, { sensitivity: "base" });
      });
      break;
  }

  return results;
}

export default function PackageSelector({
  packages,
  selected = null,
  onSelect,
  className = "",
  showSearch = true,
  showFilters = true,
}: Props): JSX.Element {
  const [internalSelected, setInternalSelected] = useState<string | null>(selected ?? null);
  const [search, setSearch] = useState<string>("");
  const [category, setCategory] = useState<string | null>("all");
  const [minPriceText, setMinPriceText] = useState<string>("");
  const [maxPriceText, setMaxPriceText] = useState<string>("");
  const [sortBy, setSortBy] = useState<FilterCriteria["sortBy"]>("recommended");
  const [activeOnly, setActiveOnly] = useState<boolean>(false);

  useEffect(() => {
    setInternalSelected(selected ?? null);
  }, [selected]);

  useEffect(() => {
    if (onSelect) onSelect(internalSelected);
  }, [internalSelected, onSelect]);

  const categories = useMemo(() => {
    const setCats = new Set<string>();
    (packages || []).forEach((p) => {
      if (p && typeof p.category === "string") setCats.add(p.category);
    });
    return ["all", ...Array.from(setCats).sort()];
  }, [packages]);

  const parsedMinPrice = minPriceText.trim() === "" ? null : Number(minPriceText);
  const parsedMaxPrice = maxPriceText.trim() === "" ? null : Number(maxPriceText);

  const criteria: FilterCriteria = useMemo(
    () => ({
      search,
      category: category === "all" ? null : category,
      minPrice: Number.isFinite(parsedMinPrice as number) ? (parsedMinPrice as number) : null,
      maxPrice: Number.isFinite(parsedMaxPrice as number) ? (parsedMaxPrice as number) : null,
      sortBy,
      activeOnly,
    }),
    [search, category, parsedMinPrice, parsedMaxPrice, sortBy, activeOnly]
  );

  const filtered = useMemo(() => filterPackages(packages || [], criteria), [packages, criteria]);

  function handleSelect(id: string | null) {
    setInternalSelected((prev) => (prev === id ? null : id));
  }

  function handleItemKeyDown(e: React.KeyboardEvent, id: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleSelect(id);
    }
  }

  function clearFilters() {
    setSearch("");
    setCategory("all");
    setMinPriceText("");
    setMaxPriceText("");
    setSortBy("recommended");
    setActiveOnly(false);
  }

  return (
    <div className={`package-selector ${className}`} aria-live="polite">
      {(showSearch || showFilters) && (
        <div className="ps-controls" style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {showSearch && (
            <div style={{ display: "flex", gap: 8 }}>
              <label htmlFor="ps-search" style={{ display: "none" }}>
                Search packages
              </label>
              <input
                id="ps-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search packages, features, description..."
                aria-label="Search packages"
                style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: "1px solid #ccc" }}
              />
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                style={{ padding: "8px 10px", borderRadius: 6 }}
              >
                Clear
              </button>
            </div>
          )}

          {showFilters && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div>
                <label htmlFor="ps-category" style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
                  Category
                </label>
                <select
                  id="ps-category"
                  value={category ?? "all"}
                  onChange={(e) => setCategory(e.target.value)}
                  aria-label="Filter by category"
                  style={{ padding: 8, borderRadius: 6 }}
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c === "all" ? "All" : c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="ps-minprice" style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
                  Min price
                </label>
                <input
                  id="ps-minprice"
                  type="number"
                  inputMode="numeric"
                  value={minPriceText}
                  onChange={(e) => setMinPriceText(e.target.value)}
                  placeholder="0"
                  aria-label="Minimum price"
                  style={{ padding: 8, borderRadius: 6, width: 100 }}
                />
              </div>

              <div>
                <label htmlFor="ps-maxprice" style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
                  Max price
                </label>
                <input
                  id="ps-maxprice"
                  type="number"
                  inputMode="numeric"
                  value={maxPriceText}
                  onChange={(e) => setMaxPriceText(e.target.value)}
                  placeholder="Any"
                  aria-label="Maximum price"
                  style={{ padding: 8, borderRadius: 6, width: 100 }}
                />
              </div>

              <div>
                <label htmlFor="ps-sort" style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
                  Sort
                </label>
                <select
                  id="ps-sort"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as FilterCriteria["sortBy"])}
                  aria-label="Sort packages"
                  style={{ padding: 8, borderRadius: 6 }}
                >
                  <option value="recommended">Recommended</option>
                  <option value="priceAsc">Price: low to high</option>
                  <option value="priceDesc">Price: high to low</option>
                  <option value="nameAsc">Name: A?Z</option>
                  <option value="nameDesc">Name: Z?A</option>
                  <option value="durationAsc">Duration: short to long</option>
                  <option value="durationDesc">Duration: long to short</option>
                </select>
              </div>

              <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={activeOnly}
                    onChange={(e) => setActiveOnly(e.target.checked)}
                    aria-label="Show active packages only"
                  />
                  <span style={{ fontSize: 13 }}>Active only</span>
                </label>
                <button type="button" onClick={clearFilters} style={{ padding: "8px 10px", borderRadius: 6 }}>
                  Clear filters
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div role="listbox" aria-label="Available packages">
        {filtered.length === 0 ? (
          <div style={{ padding: 16, borderRadius: 8, background: "#fafafa", color: "#666" }}>No packages match your filters.</div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
            {filtered.map((pkg) => {
              const isSelected = internalSelected === pkg.id;
              return (
                <li key={pkg.id}>
                  <div
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={0}
                    onClick={() => handleSelect(pkg.id)}
                    onKeyDown={(e) => handleItemKeyDown(e, pkg.id)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      padding: 12,
                      borderRadius: 8,
                      border: isSelected ? "2px solid #007bff" : "1px solid #e0e0e0",
                      background: pkg.active === false ? "#fff7f7" : "#fff",
                      cursor: "pointer",
                      boxShadow: isSelected ? "0 2px 8px rgba(0,123,255,0.12)" : undefined,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 600 }}>{pkg.name}</div>
                        {pkg.category && <div style={{ fontSize: 12, color: "#666" }}>{pkg.category}</div>}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        {typeof pkg.price === "number" ? (
                          <div style={{ fontSize: 16, fontWeight: 700 }}>${pkg.price.toFixed(2)}</div>
                        ) : (
                          <div style={{ fontSize: 14, color: "#666" }}>Contact for price</div>
                        )}
                        {pkg.duration && <div style={{ fontSize: 12, color: "#666" }}>{pkg.duration}</div>}
                      </div>
                    </div>

                    {pkg.description && <div style={{ fontSize: 13, color: "#333" }}>{pkg.description}</div>}

                    {Array.isArray(pkg.features) && pkg.features.length > 0 && (
                      <ul style={{ margin: 0, paddingLeft: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {pkg.features.map((f: any, i: number) => (
                          <li key={i} style={{ fontSize: 12, color: "#444" }}>
                            ? {String(f)}
                          </li>
                        ))}
                      </ul>
                    )}

                    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                      <button
                        type="button"
                        onClick={() => handleSelect(pkg.id)}
                        aria-pressed={isSelected}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 6,
                          border: "none",
                          background: isSelected ? "#007bff" : "#f0f0f0",
                          color: isSelected ? "#fff" : "#000",
                          cursor: "pointer",
                        }}
                      >
                        {isSelected ? "Selected" : "Select"}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (onSelect) onSelect(pkg.id);
                        }}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 6,
                          border: "1px solid #e0e0e0",
                          background: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        Details
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}