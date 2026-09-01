import { describe, expect, it } from "vitest";

import { MS_PER_YEAR, formatDuration, formatYear } from "./format.js";

/**
 * `Date` counts years astronomically — there is a year 0, and it is 1 BCE — so
 * every BCE label is off by one from the number `getUTCFullYear` returns. The
 * dataset starts at 4004 BCE, which `Date` calls -4003.
 *
 * Timestamps are built from ISO strings rather than `Date.UTC`, which remaps
 * years 0–99 into the 1900s and would quietly rewrite two of these cases.
 */
describe("formatYear", () => {
  it("labels a positive year CE", () => {
    expect(formatYear(Date.parse("0062-01-01T00:00:00Z"))).toBe("62 CE");
  });

  it("labels year 0 as 1 BCE", () => {
    expect(formatYear(Date.parse("0000-01-01T00:00:00Z"))).toBe("1 BCE");
  });

  it("shifts negative years by one to get the BCE label", () => {
    // The creation epoch the dataset is built on.
    expect(formatYear(Date.parse("-004003-01-01T00:00:00Z"))).toBe("4004 BCE");
  });
});

/**
 * The label under a gap indicator, which is a span in years and not a date.
 * Three branches, and the singular is the one an implementation drifts on: it
 * is the only value where the plural `s` has to come off.
 */
describe("formatDuration", () => {
  it("calls anything under half a year a sub-year gap", () => {
    expect(formatDuration(0)).toBe("<1 yr");
    expect(formatDuration(MS_PER_YEAR * 0.49)).toBe("<1 yr");
  });

  it("drops the plural for a single year", () => {
    expect(formatDuration(MS_PER_YEAR)).toBe("1 yr");
  });

  it("rounds to the nearest year at both ends of the singular", () => {
    // The rounding, not the span, is what picks the branch — 0.5 rounds up
    // into "1 yr" and 1.5 rounds up out of it.
    expect(formatDuration(MS_PER_YEAR * 0.5)).toBe("1 yr");
    expect(formatDuration(MS_PER_YEAR * 1.49)).toBe("1 yr");
    expect(formatDuration(MS_PER_YEAR * 1.5)).toBe("2 yrs");
  });

  it("pluralises and groups a long span", () => {
    // The Egypt sojourn, and the one label in the dataset wide enough to need
    // a thousands separator.
    expect(formatDuration(MS_PER_YEAR * 430)).toBe("430 yrs");
    expect(formatDuration(MS_PER_YEAR * 1656)).toBe("1,656 yrs");
  });
});
