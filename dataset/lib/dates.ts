/**
 * Biblical date strings <-> Unix milliseconds.
 *
 * Authored event files use human-readable dates ("1446-04-15 BC", "57 AD")
 * rather than raw epoch milliseconds: the dataset spans six millennia BC and
 * hand-computing epoch offsets is error-prone. The build step converts.
 *
 * Era conversion uses astronomical year numbering internally (1 BC = year 0),
 * and dates are interpreted as proleptic Gregorian UTC.
 */

export type Precision = "year" | "month" | "day";

export interface ParsedDate {
  ms: number;
  precision: Precision;
}

const DATE_RE = /^(\d{1,6})(?:-(\d{1,2}))?(?:-(\d{1,2}))?\s+(BC|AD)$/;

/** Parses "4004-10-23 BC" / "1446-04 BC" / "57 AD" into epoch ms. */
export function parseDate(input: string): ParsedDate {
  const match = DATE_RE.exec(input.trim());
  if (!match) {
    throw new Error(
      `Invalid date "${input}" (expected "<year>[-<month>[-<day>]] BC|AD", e.g. "1446-04-15 BC")`,
    );
  }

  const [, yearStr, monthStr, dayStr, era] = match;
  const year = Number(yearStr);
  const month = monthStr ? Number(monthStr) : 1;
  const day = dayStr ? Number(dayStr) : 1;

  if (year === 0)
    throw new Error(
      `Invalid date "${input}": there is no year 0 in BC/AD notation`,
    );
  if (month < 1 || month > 12)
    throw new Error(`Invalid date "${input}": month out of range`);
  if (day < 1 || day > 31)
    throw new Error(`Invalid date "${input}": day out of range`);

  // 1 BC is astronomical year 0, 2 BC is -1, and so on.
  const astronomicalYear = era === "BC" ? 1 - year : year;

  const date = new Date(Date.UTC(2000, month - 1, day));
  date.setUTCFullYear(astronomicalYear);

  if (date.getUTCDate() !== day || date.getUTCMonth() !== month - 1) {
    throw new Error(`Invalid date "${input}": no such calendar day`);
  }

  return {
    ms: date.getTime(),
    precision: dayStr ? "day" : monthStr ? "month" : "year",
  };
}

/**
 * Length in ms of the calendar period an authored date of this precision
 * asserts: the whole year for "30 AD", the whole month for "30-04 AD". A day
 * precision date asserts a single day and so spans nothing to place within.
 *
 * `ms` must be the start of that period, which is what parseDate returns.
 */
export function precisionSpan(ms: number, precision: Precision): number {
  if (precision === "day") return 0;

  const next = new Date(ms);
  if (precision === "year") next.setUTCFullYear(next.getUTCFullYear() + 1);
  else next.setUTCMonth(next.getUTCMonth() + 1);

  return next.getTime() - ms;
}

/** Inverse of parseDate, used when converting legacy epoch-ms datasets. */
export function formatDate(ms: number, precision: Precision = "day"): string {
  const date = new Date(ms);
  const astronomicalYear = date.getUTCFullYear();
  const era = astronomicalYear <= 0 ? "BC" : "AD";
  const year = astronomicalYear <= 0 ? 1 - astronomicalYear : astronomicalYear;

  const pad = (n: number) => String(n).padStart(2, "0");
  if (precision === "year") return `${year} ${era}`;
  if (precision === "month")
    return `${year}-${pad(date.getUTCMonth() + 1)} ${era}`;
  return `${year}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${era}`;
}
