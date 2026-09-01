import { describe, expect, it } from "vitest";

import { formatYear } from "./format.js";

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
