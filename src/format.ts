import type { Time } from "./timeline/types.js";

/** Astronomical year numbering: year 0 is 1 BCE, so `1 - year` for year <= 0. */
export function formatYear(ts: Time): string {
  const year = new Date(ts).getUTCFullYear();
  return year <= 0 ? `${1 - year} BCE` : `${year} CE`;
}
