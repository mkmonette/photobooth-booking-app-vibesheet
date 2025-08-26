export function formatCurrency(amount: number, currency?: string): string {
  if (amount == null || !Number.isFinite(amount)) return '';

  const locale =
    typeof navigator !== 'undefined' && typeof navigator.language === 'string'
      ? navigator.language
      : 'en-US';

  try {
    if (currency) {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        currencyDisplay: 'symbol',
      }).format(amount);
    }

    // Fallback: format as decimal with two fraction digits when no currency provided
    return new Intl.NumberFormat(locale, {
      style: 'decimal',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Graceful fallback if Intl throws (e.g., invalid currency)
    const rounded = Number.isFinite(amount) ? amount.toFixed(2) : String(amount);
    return currency ? `${rounded} ${currency}` : rounded;
  }
}

export function formatDate(
  date: Date | string,
  opts?: Intl.DateTimeFormatOptions & { locale?: string }
): string {
  if (date == null) return '';

  const { locale: optLocale, ...rest } = opts || {};
  const locale =
    optLocale ||
    (typeof navigator !== 'undefined' && typeof navigator.language === 'string'
      ? navigator.language
      : 'en-US');

  const dateOpts = rest as Intl.DateTimeFormatOptions;
  const finalOpts: Intl.DateTimeFormatOptions = { ...(dateOpts || {}) };

  let dt: Date;
  if (typeof date === 'string') {
    dt = new Date(date);
  } else {
    dt = date;
  }

  if (Number.isNaN(dt.getTime())) return '';

  // If no explicit date/time style provided, choose sensible defaults:
  // - If time component exists (non-midnight), include short time.
  // - Always include a readable date (year, month, day).
  const explicitKeys = [
    'year',
    'month',
    'day',
    'hour',
    'timeZoneName',
    'hour12',
    'hourCycle',
    'minute',
    'second',
    'timeStyle',
    'dateStyle',
  ];

  const hasExplicitDateOrTime = explicitKeys.some(
    (k) => (finalOpts as any)[k] !== undefined && (finalOpts as any)[k] !== null
  );

  if (!hasExplicitDateOrTime) {
    const hasTime =
      dt.getHours() !== 0 ||
      dt.getMinutes() !== 0 ||
      dt.getSeconds() !== 0 ||
      dt.getMilliseconds() !== 0;

    if (hasTime) {
      Object.assign(finalOpts, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } else {
      Object.assign(finalOpts, { year: 'numeric', month: 'short', day: 'numeric' });
    }
  }

  try {
    return new Intl.DateTimeFormat(locale, finalOpts).format(dt);
  } catch {
    // Fallback to toLocaleString with locale if Intl.DateTimeFormat failed for provided options
    try {
      return dt.toLocaleString(locale);
    } catch {
      return dt.toString();
    }
  }
}

export function humanizeDuration(minutes: number): string {
  if (minutes == null || !Number.isFinite(minutes)) return '';

  const sign = minutes < 0 ? '-' : '';
  const absMinutes = Math.abs(minutes);
  const rounded = Math.round(absMinutes);

  if (rounded === 0) return sign + 'less than a minute';

  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours} hr${hours > 1 ? 's' : ''}`);
  }

  if (mins > 0) {
    parts.push(`${mins} min${mins > 1 ? 's' : ''}`);
  }

  return sign + parts.join(' ');
}