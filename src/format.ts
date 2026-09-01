import type { Time } from "./timeline/types.js";

/** Astronomical year numbering: year 0 is 1 BCE, so `1 - year` for year <= 0. */
export function formatYear(ts: Time): string {
  const year = new Date(ts).getUTCFullYear();
  return year <= 0 ? `${1 - year} BCE` : `${year} CE`;
}

/** Mean Julian year. The timeline labels spans in years, never in days. */
export const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000;

/**
 * A millisecond span as a year count: `"<1 yr"`, `"1 yr"`, `"1,656 yrs"`.
 *
 * Rounds rather than truncates, so a span reads as the year count a person
 * would say out loud. Anything that rounds to zero gets `"<1 yr"` instead of
 * `"0 yrs"` — on this dataset the gaps are millennia wide and a zero there
 * means the two events are close, not that no time passed.
 */
export function formatDuration(ms: number): string {
  const years = Math.round(ms / MS_PER_YEAR);
  if (years === 0) return "<1 yr";
  if (years === 1) return "1 yr";
  return `${years.toLocaleString()} yrs`;
}
